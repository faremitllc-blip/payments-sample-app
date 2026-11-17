import { createSign } from 'node:crypto'
import { cleanCredential, isSwitchOn } from './clean'

/**
 * Server-side client for Salt Edge Payment Initiation (open banking). The App ID, secret and
 * signing key come from environment variables only and never reach the browser or the code.
 *
 * Flow: create a one-time customer, ask for a SEPA payment straight into the user's own Bridge
 * euro IBAN with "Pay with Connect", send the user to Salt Edge's hosted bank page, and later
 * read how the payment ended. Live accounts must sign every request with an RSA key.
 */

const BASE = 'https://www.saltedge.com/api/payments/v1'
const CONNECT_PAGE = 'https://www.saltedge.com/payments/connect'

export interface SaltEdgeStarted {
  /** Stored in the top-up row: "se:<top-up id>:<connect token>". */
  webformId: string
  url: string
  expiresAt: string
}

export interface SaltEdgeCheck {
  status: 'waiting' | 'sent' | 'failed' | 'cancelled'
  paymentId?: string
  error?: string
}

function settings() {
  const config = useRuntimeConfig()
  const appId = cleanCredential(config.saltedgeAppId)
  const secret = cleanCredential(config.saltedgeSecret)
  // A PEM key keeps its line breaks. Vercel may store them as \n text, so turn those back.
  let pem = String(config.saltedgePrivateKey || '').trim()
  if (pem.length >= 2 && /^(["'`]).*\1$/s.test(pem)) pem = pem.slice(1, -1).trim()
  pem = pem.replace(/\\n/g, '\n')
  if (!appId || !secret) {
    throw createError({ statusCode: 503, statusMessage: 'Open banking is not set up on the server yet' })
  }
  if (!pem.includes('PRIVATE KEY')) {
    throw createError({ statusCode: 503, statusMessage: 'The open banking signing key is not set up on the server yet' })
  }
  // This moves real money, so it works only when ALLOW_LIVE_OPENBANKING=true is set.
  if (!isSwitchOn(config.allowLiveOpenBanking)) {
    throw createError({ statusCode: 503, statusMessage: 'Live open banking is switched off' })
  }
  return { appId, secret, pem }
}

export function saltEdgeConfigured(): boolean {
  const config = useRuntimeConfig()
  return cleanCredential(config.saltedgeAppId).length > 0 && cleanCredential(config.saltedgeSecret).length > 0
}

export function isSaltEdgeRef(stored: string | null | undefined): boolean {
  return typeof stored === 'string' && stored.startsWith('se:')
}

/** "se:<top-up id>:<connect token>[:<payment id>]" */
function parseStored(stored: string): { topupId: string; token: string; paymentId: string } {
  const [, topupId = '', token = '', paymentId = ''] = stored.split(':')
  return { topupId, token, paymentId }
}

/** Adds the payment id Salt Edge sent the customer back with. */
export function withPaymentId(stored: string, paymentId: string): string {
  const p = parseStored(stored)
  return `se:${p.topupId}:${p.token}:${paymentId}`
}

function refusal(err: any): string {
  const d = err?.data
  const e = d?.error && typeof d.error === 'object' ? d.error : d
  const parts: string[] = []
  const status = Number(err?.statusCode) || 0
  if (status) parts.push(`HTTP ${status}`)
  if (e && typeof e === 'object') {
    for (const k of ['class', 'error_class', 'message', 'error_message']) {
      if (typeof e[k] === 'string' && e[k]) parts.push(e[k])
    }
  } else if (typeof d === 'string' && d) {
    parts.push(d)
  }
  if (parts.length <= 1 && err?.message) parts.push(String(err.message))
  const text = parts.join(': ').replace(/\s+/g, ' ').slice(0, 300)
  return text || 'The bank service did not accept the request'
}

async function call<T>(path: string, method: 'GET' | 'POST', payload?: unknown): Promise<T> {
  const s = settings()
  const url = `${BASE}${path}`
  const body = payload === undefined ? '' : JSON.stringify(payload)
  const expires = String(Math.floor(Date.now() / 1000) + 60)
  // The signed text is: expiry|METHOD|full url|body, signed with the private key (RSA, SHA-256).
  const signature = createSign('RSA-SHA256').update(`${expires}|${method}|${url}|${body}`).sign(s.pem, 'base64')
  try {
    return await $fetch<T>(url, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'App-id': s.appId,
        Secret: s.secret,
        'Expires-at': expires,
        Signature: signature,
      },
      body: body || undefined,
      timeout: 20_000,
    })
  } catch (err: any) {
    const status = Number(err?.statusCode) || 0
    console.error('Salt Edge request failed', method, path, status, JSON.stringify(err?.data || String(err?.message || '')).slice(0, 500))
    throw createError({ statusCode: status && status < 500 ? 400 : 502, statusMessage: refusal(err) })
  }
}

export async function startSaltEdgePayment(
  topupId: string,
  p: {
    amount: number
    recipientName: string
    iban: string
    reference: string
    clientIp: string
    returnUri: string
  },
): Promise<SaltEdgeStarted> {
  // One customer per top-up, so nothing has to be remembered between payments.
  const customer = await call<{ data?: { id?: string } }>('/customers', 'POST', {
    data: { identifier: `mondo-${topupId}` },
  })
  const customerId = customer?.data?.id
  if (!customerId) throw createError({ statusCode: 502, statusMessage: 'The bank service gave an unexpected answer' })

  const ip = /^[0-9a-fA-F:.]{3,45}$/.test(p.clientIp) ? p.clientIp : '127.0.0.1'
  const reference = p.reference.slice(0, 140)
  const res = await call<{ data?: { connect_url?: string; expires_at?: string } }>('/payments/connect', 'POST', {
    data: {
      customer_id: customerId,
      template_identifier: 'SEPA',
      show_consent_confirmation: true,
      return_payment_id: true,
      return_error_class: true,
      return_to: p.returnUri,
      payment_attributes: {
        end_to_end_id: topupId.replace(/-/g, ''),
        reference,
        description: reference,
        customer_last_logged_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
        customer_ip_address: ip,
        amount: p.amount.toFixed(2),
        currency_code: 'EUR',
        creditor_iban: p.iban,
        creditor_name: p.recipientName,
      },
    },
  })
  const connectUrl = String(res?.data?.connect_url || '')
  let token = ''
  let host = ''
  try {
    const u = new URL(connectUrl)
    host = u.hostname
    token = u.searchParams.get('token') || ''
  } catch {
    host = ''
  }
  // Only send the customer to Salt Edge's own page.
  if (!token || !/(^|\.)saltedge\.com$/i.test(host) || !/^[A-Za-z0-9_.~-]{8,2000}$/.test(token)) {
    throw createError({ statusCode: 502, statusMessage: 'The bank service gave an unexpected address' })
  }
  return {
    webformId: `se:${topupId}:${token}`,
    url: `${CONNECT_PAGE}?token=${encodeURIComponent(token)}`,
    expiresAt: res?.data?.expires_at || new Date(Date.now() + 15 * 60_000).toISOString(),
  }
}

/** The bank page address for a payment that was already started. */
export function saltEdgeLink(stored: string): string {
  return `${CONNECT_PAGE}?token=${encodeURIComponent(parseStored(stored).token)}`
}

/** Reads how the payment is going. Never changes anything at the bank. */
export async function checkSaltEdgePayment(stored: string): Promise<SaltEdgeCheck> {
  const { paymentId } = parseStored(stored)
  // Until the customer comes back we do not know the payment id.
  if (!/^[0-9]{1,30}$/.test(paymentId)) return { status: 'waiting' }
  const res = await call<{ data?: { status?: string } }>(`/payments/${paymentId}`, 'GET')
  const state = String(res?.data?.status || '').toLowerCase()
  if (state === 'accepted') return { status: 'sent', paymentId }
  if (state === 'deleted') return { status: 'cancelled', paymentId }
  if (state === 'rejected' || state === 'failed') {
    return { status: 'failed', paymentId, error: 'The bank did not complete the payment' }
  }
  // processing and unknown: keep waiting.
  return { status: 'waiting', paymentId }
}
