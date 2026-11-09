import { createHmac } from 'node:crypto'
import { cleanCredential, isSwitchOn } from './clean'

/**
 * Server-side client for finAPI (open banking payment initiation). The client
 * ID and secret come from environment variables and never reach the browser.
 *
 * Flow: make a short-lived finAPI user for each top-up, ask the Web Form for a
 * SEPA payment to the user's own Bridge euro IBAN, and later read the result.
 */

const SANDBOX_API = 'https://sandbox.finapi.io'
const SANDBOX_WEBFORM = 'https://webform-sandbox.finapi.io'

function settings() {
  const config = useRuntimeConfig()
  const clientId = cleanCredential(config.finapiClientId)
  const clientSecret = cleanCredential(config.finapiClientSecret)
  if (!clientId || !clientSecret) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Open banking is not set up on the server yet',
    })
  }
  const apiUrl = (String(config.finapiApiUrl || '').trim() || SANDBOX_API).replace(/\/+$/, '')
  const webformUrl = (String(config.finapiWebformUrl || '').trim() || SANDBOX_WEBFORM).replace(/\/+$/, '')

  // Same safety idea as for Circle and Bridge: anything that is not the sandbox
  // moves real money, so it works only when ALLOW_LIVE_OPENBANKING=true is set.
  const live = !/sandbox/i.test(apiUrl) || !/sandbox/i.test(webformUrl)
  if (live && !isSwitchOn(config.allowLiveOpenBanking)) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Only the finAPI sandbox is allowed. Live open banking is switched off',
    })
  }
  return {
    clientId,
    clientSecret,
    apiUrl,
    webformUrl,
    live,
    instant: isSwitchOn(config.finapiInstant),
  }
}

export function openBankingMode(): { configured: boolean } {
  const config = useRuntimeConfig()
  return {
    configured:
      cleanCredential(config.finapiClientId).length > 0 &&
      cleanCredential(config.finapiClientSecret).length > 0,
  }
}

function finapiMessage(err: any): string {
  const first = Array.isArray(err?.data?.errors) ? err.data.errors[0] : null
  const message = first?.message || err?.data?.error_description || err?.data?.message || err?.statusMessage
  return typeof message === 'string' && message ? message.slice(0, 240) : 'The bank payment service did not accept the request'
}

async function call<T>(
  url: string,
  options: { method?: 'GET' | 'POST'; token?: string; body?: unknown; form?: Record<string, string> } = {},
): Promise<T> {
  const headers: Record<string, string> = {}
  if (options.token) headers.Authorization = `Bearer ${options.token}`
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
    console.error('finAPI request failed', url.replace(/\?.*$/, ''), status, JSON.stringify(err?.data || '').slice(0, 400))
    const wrapped: any = createError({
      statusCode: status && status < 500 ? 400 : 502,
      statusMessage: finapiMessage(err),
    })
    wrapped.finapiStatus = status
    throw wrapped
  }
}

/** Tries the current API version first, then the older one if that path does not exist. */
async function callVersioned<T>(
  apiUrl: string,
  path: string,
  options: Parameters<typeof call>[1],
): Promise<T> {
  let last: any
  for (const version of ['v2', 'v1']) {
    try {
      return await call<T>(`${apiUrl}/api/${version}${path}`, options)
    } catch (err: any) {
      last = err
      if (err?.finapiStatus !== 404) throw err
    }
  }
  throw last
}

interface TokenResponse {
  access_token: string
}

async function clientToken(): Promise<string> {
  const s = settings()
  const res = await callVersioned<TokenResponse>(s.apiUrl, '/oauth/token', {
    method: 'POST',
    form: { grant_type: 'client_credentials', client_id: s.clientId, client_secret: s.clientSecret },
  })
  return res.access_token
}

// Each top-up gets its own finAPI user. Its name and password are worked out from
// the top-up id and the client secret, so nothing extra has to be stored.
function finapiUser(topupId: string): { id: string; password: string } {
  const s = settings()
  const id = `m${topupId.replace(/-/g, '')}`
  const password = `Mo-${createHmac('sha256', s.clientSecret).update(`finapi-user:${topupId}`).digest('hex').slice(0, 32)}`
  return { id, password }
}

async function userToken(topupId: string): Promise<string> {
  const s = settings()
  const u = finapiUser(topupId)
  const res = await callVersioned<TokenResponse>(s.apiUrl, '/oauth/token', {
    method: 'POST',
    form: {
      grant_type: 'password',
      client_id: s.clientId,
      client_secret: s.clientSecret,
      username: u.id,
      password: u.password,
    },
  })
  return res.access_token
}

export interface StartedPayment {
  webformId: string
  url: string
  expiresAt: string
}

export async function startEuroPayment(
  topupId: string,
  payment: { amount: number; recipientName: string; iban: string; bic?: string; purpose: string },
): Promise<StartedPayment> {
  const s = settings()
  const u = finapiUser(topupId)

  const cToken = await clientToken()
  try {
    await callVersioned(s.apiUrl, '/users', {
      method: 'POST',
      token: cToken,
      body: { id: u.id, password: u.password, isAutoUpdateEnabled: false },
    })
  } catch (err: any) {
    // The user may already exist if this top-up was retried.
    if (err?.finapiStatus !== 422 && err?.finapiStatus !== 409) throw err
  }

  const uToken = await userToken(topupId)
  const recipient: Record<string, string> = { name: payment.recipientName, iban: payment.iban }
  if (payment.bic) recipient.bic = payment.bic

  const form = await call<{ id: string; url: string; expiresAt?: string }>(
    `${s.webformUrl}/api/webForms/standalonePayment`,
    {
      method: 'POST',
      token: uToken,
      body: {
        orders: [
          {
            recipient,
            amount: { value: payment.amount, currency: 'EUR' },
            purpose: payment.purpose,
            endToEndId: topupId.replace(/-/g, '').slice(0, 30),
          },
        ],
        instantPayment: s.instant,
      },
    },
  )
  if (!form?.id || !form?.url) {
    throw createError({ statusCode: 502, statusMessage: 'The bank payment service gave no payment link' })
  }
  return {
    webformId: form.id,
    url: form.url,
    expiresAt: form.expiresAt || new Date(Date.now() + 20 * 60_000).toISOString(),
  }
}

export type TopupStatus = 'waiting' | 'sent' | 'failed' | 'cancelled'

export interface PaymentCheck {
  status: TopupStatus
  paymentId?: string
  error?: string
}

/** Reads how the payment is going. Never changes anything at the bank. */
export async function checkEuroPayment(topupId: string, webformId: string): Promise<PaymentCheck> {
  const s = settings()
  const uToken = await userToken(topupId)
  const form = await call<any>(`${s.webformUrl}/api/webForms/${encodeURIComponent(webformId)}`, { token: uToken })

  const state = String(form?.status || '')
  if (state === 'ABORTED') return { status: 'cancelled' }
  if (state === 'COMPLETED_WITH_ERROR') {
    return { status: 'failed', error: 'The bank did not accept the payment' }
  }
  if (state !== 'COMPLETED') return { status: 'waiting' }

  const paymentId = form?.payload?.paymentId != null ? String(form.payload.paymentId) : undefined
  if (!paymentId) return { status: 'sent' }

  try {
    const res = await call<any>(`${s.apiUrl}/api/v1/payments?ids=${encodeURIComponent(paymentId)}`, { token: uToken })
    const payment = Array.isArray(res?.payments) ? res.payments[0] : Array.isArray(res) ? res[0] : null
    const pay = String(payment?.status || '').toUpperCase()
    if (pay === 'NOT_SUCCESSFUL' || pay === 'DISCARDED') {
      return { status: 'failed', paymentId, error: 'The bank did not complete the payment' }
    }
  } catch {
    // The form says it completed; the payment detail can be read on the next check.
  }
  return { status: 'sent', paymentId }
}
