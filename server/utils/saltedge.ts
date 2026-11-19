import { createSign } from 'node:crypto'
import { cleanCredential, isSwitchOn } from './clean'

/**
 * Server-side client for Salt Edge Payment Initiation API v6 (open banking, partner account). The App ID, secret and
 * signing key come from environment variables only and never reach the browser or the code.
 *
 * Flow: create or find the customer (a "lead"), ask for a SEPA payment straight into the user's own Bridge
 * euro IBAN with "Pay with Connect", send the user to Salt Edge's hosted bank page, and later
 * read how the payment ended. Live accounts must sign every request with an RSA key.
 */

const BASE = 'https://www.saltedge.com/api/v6'
const CONNECT_PAGE = 'https://www.saltedge.com/payments/connect'

export interface SaltEdgeStarted {
  /** Stored in the top-up row: "se:<top-up id>:<connect token>:<customer id>:<payment id>". */
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

/** "se:<top-up id>:<connect token>:<customer id>:<payment id>" */
function parseStored(stored: string): { topupId: string; token: string; customerId: string; paymentId: string } {
  const [, topupId = '', token = '', customerId = '', paymentId = ''] = stored.split(':')
  return { topupId, token, customerId, paymentId }
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
    email: string
    userId: string
    knownCustomerId?: string
    clientIp: string
    returnUri: string
    providerCode?: string
    country?: string
  },
): Promise<SaltEdgeStarted> {
  // Reuse the customer made for this user's earlier top-up, otherwise create one.
  let customerId = /^[0-9]{1,30}$/.test(p.knownCustomerId || '') ? String(p.knownCustomerId) : ''
  if (!customerId) {
    const created = await call<{ data?: { customer_id?: string | number } }>('/customers', 'POST', {
      data: { email: p.email, identifier: p.userId },
    })
    customerId = String(created?.data?.customer_id || '')
  }
  if (!/^[0-9]{1,30}$/.test(customerId)) {
    throw createError({ statusCode: 502, statusMessage: 'The bank service gave an unexpected answer' })
  }

  const ip = /^[0-9a-fA-F:.]{3,45}$/.test(p.clientIp) ? p.clientIp : '127.0.0.1'
  const reference = p.reference.slice(0, 140)
  const country = p.iban.slice(0, 2).toUpperCase()
  const res = await call<{ data?: { payment_url?: string; payment_id?: string | number; expires_at?: string } }>(
    '/payments/create',
    'POST',
    {
      data: {
        customer_id: customerId,
        template_identifier: 'SEPA',
        return_error_class: true,
        ...(/^[a-z0-9_-]{2,80}$/i.test(p.providerCode || '')
          ? {
              // The customer already picked a bank in Mondo, so go straight to it.
              provider: { code: p.providerCode, include_sandboxes: false },
              widget: { skip_provider_selection: true },
            }
          : /^[A-Z]{2}$/.test(p.country || '')
            ? { widget: { popular_providers_country: p.country } }
            : {}),
        attempt: { return_to: p.returnUri, locale: 'en' },
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
          creditor_country_code: /^[A-Z]{2}$/.test(country) ? country : 'DE',
        },
      },
    },
  )
  const payUrl = String(res?.data?.payment_url || '')
  const paymentId = String(res?.data?.payment_id || '')
  let token = ''
  let host = ''
  try {
    const u = new URL(payUrl)
    host = u.hostname
    token = u.searchParams.get('token') || ''
  } catch {
    host = ''
  }
  // Only send the customer to Salt Edge's own page.
  if (
    !token ||
    !/(^|\.)saltedge\.com$/i.test(host) ||
    !/^[A-Za-z0-9_.~-]{8,2000}$/.test(token) ||
    !/^[0-9]{1,30}$/.test(paymentId)
  ) {
    throw createError({ statusCode: 502, statusMessage: 'The bank service gave an unexpected address' })
  }
  return {
    webformId: `se:${topupId}:${token}:${customerId}:${paymentId}`,
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
  if (!/^[0-9]{1,30}$/.test(paymentId)) return { status: 'waiting' }
  const res = await call<{ data?: { status?: string } }>(`/payments/${paymentId}`, 'GET')
  const state = String(res?.data?.status || '').toLowerCase()
  if (state === 'executed' || state === 'settled') return { status: 'sent', paymentId }
  if (state === 'failed') {
    return { status: 'failed', paymentId, error: 'The bank did not complete the payment' }
  }
  // initiated, authorizing, authorized: still going.
  return { status: 'waiting', paymentId }
}


export interface SaltEdgeBank {
  code: string
  name: string
  logo: string
}

const BANK_CACHE = new Map<string, { at: number; banks: SaltEdgeBank[] }>()
const PAYABLE = new Set(['SEPA', 'SEPA_INSTANT', 'SEPA_INSTANT_OR_SEPA'])

/** Banks in a country that can take a euro (SEPA) payment, from Salt Edge. Kept for an hour. */
export async function listSaltEdgeBanks(country: string): Promise<SaltEdgeBank[]> {
  const cc = country.toUpperCase()
  if (!/^[A-Z]{2}$/.test(cc)) return []
  const hit = BANK_CACHE.get(cc)
  if (hit && Date.now() - hit.at < 3_600_000) return hit.banks

  const banks: SaltEdgeBank[] = []
  let from = ''
  for (let page = 0; page < 6; page++) {
    const q =
      `country_code=${cc}&include_pis_fields=true&include_sandboxes=false&exclude_inactive=true&per_page=100` +
      (from ? `&from_id=${encodeURIComponent(from)}` : '')
    const res = await call<{ data?: any[]; meta?: { next_id?: string | null } }>(`/providers?${q}`, 'GET')
    for (const item of res?.data || []) {
      const templates: unknown[] = Array.isArray(item?.payment_templates) ? item.payment_templates : []
      if (!templates.some((t) => PAYABLE.has(String(t)))) continue
      const code = String(item?.code || '')
      if (!/^[a-z0-9_-]{2,80}$/i.test(code) || String(item?.status || 'active') !== 'active') continue
      const logo = String(item?.logo_url || '')
      banks.push({
        code,
        name: String(item?.name || code).slice(0, 80),
        logo: /^https:\/\//.test(logo) ? logo : '',
      })
    }
    const next = res?.meta?.next_id
    if (!next) break
    from = String(next)
  }
  banks.sort((a, b) => a.name.localeCompare(b.name))
  BANK_CACHE.set(cc, { at: Date.now(), banks })
  return banks
}
