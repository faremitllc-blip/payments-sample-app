import { createSign } from 'node:crypto'
import { cleanCredential, isSwitchOn } from './clean'

/**
 * Server-side client for TrueLayer (open banking payment initiation). The client
 * secret and the signing key come from environment variables and never reach the
 * browser or the code.
 *
 * Flow: ask TrueLayer for a euro bank payment straight into the user's own Bridge
 * euro IBAN, send the user to TrueLayer's hosted bank page, and later read the result.
 * The sandbox or live hosts are chosen from the client ID ("sandbox-..." is sandbox).
 */

export interface TrueLayerStarted {
  /** Stored in the top-up row: "tl:<payment id>:<resource token>". */
  webformId: string
  url: string
  expiresAt: string
}

export interface TrueLayerCheck {
  status: 'waiting' | 'sent' | 'failed' | 'cancelled'
  paymentId?: string
  error?: string
}

function settings() {
  const config = useRuntimeConfig()
  const clientId = cleanCredential(config.truelayerClientId)
  const clientSecret = cleanCredential(config.truelayerClientSecret)
  const kid = cleanCredential(config.truelayerKid)
  // A PEM key keeps its line breaks. Vercel may store them as \n text, so turn those back.
  let pem = String(config.truelayerPrivateKey || '').trim()
  if (pem.length >= 2 && /^(["'`]).*\1$/s.test(pem)) pem = pem.slice(1, -1).trim()
  pem = pem.replace(/\\n/g, '\n')
  if (!clientId || !clientSecret) {
    throw createError({ statusCode: 503, statusMessage: 'Open banking is not set up on the server yet' })
  }
  if (!kid || !pem.includes('PRIVATE KEY')) {
    throw createError({ statusCode: 503, statusMessage: 'The open banking signing key is not set up on the server yet' })
  }
  const live = !/^sandbox-/i.test(clientId)
  if (live && !isSwitchOn(config.allowLiveOpenBanking)) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Only the TrueLayer sandbox is allowed. Live open banking is switched off',
    })
  }
  return {
    clientId,
    clientSecret,
    kid,
    pem,
    live,
    authUrl: live ? 'https://auth.truelayer.com' : 'https://auth.truelayer-sandbox.com',
    apiUrl: live ? 'https://api.truelayer.com' : 'https://api.truelayer-sandbox.com',
    pageUrl: live ? 'https://payment.truelayer.com' : 'https://payment.truelayer-sandbox.com',
  }
}

export function trueLayerConfigured(): boolean {
  const config = useRuntimeConfig()
  return (
    cleanCredential(config.truelayerClientId).length > 0 &&
    cleanCredential(config.truelayerClientSecret).length > 0
  )
}

const b64u = (input: Buffer | string) =>
  Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/**
 * The Tl-Signature header: a detached ES512 signature over
 * "METHOD path\nIdempotency-Key: value\nbody", as TrueLayer's signing scheme describes.
 */
export function signRequest(opts: {
  kid: string
  pem: string
  method: string
  path: string
  idempotencyKey: string
  body: string
}): string {
  const header = b64u(
    JSON.stringify({ alg: 'ES512', kid: opts.kid, tl_version: '2', tl_headers: 'Idempotency-Key' }),
  )
  const payload = b64u(
    `${opts.method.toUpperCase()} ${opts.path}\nIdempotency-Key: ${opts.idempotencyKey}\n${opts.body}`,
  )
  const signer = createSign('SHA512')
  signer.update(`${header}.${payload}`)
  // ES512 wants the raw r||s form, not the DER form.
  const signature = signer.sign({ key: opts.pem, dsaEncoding: 'ieee-p1363' })
  return `${header}..${b64u(signature)}`
}

function message(err: any): string {
  const d = err?.data
  const text =
    d?.detail || d?.title || d?.error_description || d?.error || d?.message || err?.statusMessage
  return typeof text === 'string' && text ? text.slice(0, 240) : 'The bank payment service did not accept the request'
}

async function call<T>(
  url: string,
  options: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string; form?: Record<string, string> } = {},
): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers || {}) }
  let body: any = options.body
  if (options.form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    body = new URLSearchParams(options.form).toString()
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  try {
    return await $fetch<any>(url, { method: options.method || 'GET', headers, body, timeout: 15_000 })
  } catch (err: any) {
    const status = Number(err?.statusCode) || 0
    console.error('TrueLayer request failed', url, status, JSON.stringify(err?.data || '').slice(0, 500))
    throw createError({ statusCode: status && status < 500 ? 400 : 502, statusMessage: message(err) })
  }
}

async function accessToken(): Promise<string> {
  const s = settings()
  const res = await call<{ access_token?: string }>(`${s.authUrl}/connect/token`, {
    method: 'POST',
    form: {
      grant_type: 'client_credentials',
      client_id: s.clientId,
      client_secret: s.clientSecret,
      scope: 'payments',
    },
  })
  if (!res?.access_token) {
    throw createError({ statusCode: 502, statusMessage: 'The bank payment service gave no access token' })
  }
  return res.access_token
}

export async function startTrueLayerPayment(
  topupId: string,
  payment: {
    amount: number
    recipientName: string
    iban: string
    payerName: string
    payerEmail: string
    returnUri: string
  },
): Promise<TrueLayerStarted> {
  const s = settings()
  const token = await accessToken()

  const body = JSON.stringify({
    amount_in_minor: Math.round(payment.amount * 100),
    currency: 'EUR',
    payment_method: {
      type: 'bank_transfer',
      provider_selection: { type: 'user_selected' },
      beneficiary: {
        type: 'external_account',
        account_holder_name: payment.recipientName,
        account_identifier: { type: 'iban', iban: payment.iban },
      },
    },
    user: { name: payment.payerName, email: payment.payerEmail },
  })
  // The top-up id doubles as the idempotency key, so a retry cannot pay twice.
  const key = topupId
  const signature = signRequest({
    kid: s.kid,
    pem: s.pem,
    method: 'POST',
    path: '/v3/payments',
    idempotencyKey: key,
    body,
  })
  const res = await call<{ id?: string; resource_token?: string }>(`${s.apiUrl}/v3/payments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': key, 'Tl-Signature': signature },
    body,
  })
  if (!res?.id || !res?.resource_token) {
    throw createError({ statusCode: 502, statusMessage: 'The bank payment service gave no payment link' })
  }
  const url =
    `${s.pageUrl}/payments#payment_id=${encodeURIComponent(res.id)}` +
    `&resource_token=${encodeURIComponent(res.resource_token)}` +
    `&return_uri=${encodeURIComponent(payment.returnUri)}`
  return {
    webformId: `tl:${res.id}:${res.resource_token}`,
    url,
    // The resource token lasts 15 minutes.
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  }
}

/** Splits the stored "tl:<id>:<token>" value. */
function parseStored(stored: string): { id: string; token: string } {
  const [, id = '', token = ''] = stored.split(':')
  return { id, token }
}

export function isTrueLayerRef(stored: string | null | undefined): boolean {
  return typeof stored === 'string' && stored.startsWith('tl:')
}

/** The bank page address for a payment that was already created. */
export function trueLayerLink(stored: string, returnUri: string): string {
  const s = settings()
  const p = parseStored(stored)
  return (
    `${s.pageUrl}/payments#payment_id=${encodeURIComponent(p.id)}` +
    `&resource_token=${encodeURIComponent(p.token)}` +
    `&return_uri=${encodeURIComponent(returnUri)}`
  )
}

/** Reads how the payment is going. Never changes anything at the bank. */
export async function checkTrueLayerPayment(stored: string): Promise<TrueLayerCheck> {
  const s = settings()
  const { id } = parseStored(stored)
  const token = await accessToken()
  const res = await call<any>(`${s.apiUrl}/v3/payments/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const state = String(res?.status || '')
  // For a payment into an outside account, "executed" is the final good state.
  if (state === 'executed' || state === 'settled') return { status: 'sent', paymentId: id }
  if (state === 'failed') {
    const reason = String(res?.failure_reason || '')
    if (reason === 'canceled' || reason === 'cancelled') return { status: 'cancelled', paymentId: id }
    return { status: 'failed', paymentId: id, error: 'The bank did not complete the payment' }
  }
  return { status: 'waiting' }
}
