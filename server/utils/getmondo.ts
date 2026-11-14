import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { cleanCredential, isSwitchOn } from './clean'

/**
 * Server-side client for the getMondo server-to-server cards API. The account ID and
 * secret key come from environment variables and never reach the browser.
 *
 * Card details pass through this server to getMondo and are never stored or logged.
 */

const BASE = 'https://server-to-server.getmondo.co'

export interface CardPaymentInput {
  amount: number
  currency: string
  sessionId: string
  cardNumber: string
  expMonth: string
  expYear: string
  cvv: string
  name: string
  email: string
  phoneCountry: string
  phone: string
  birthYear: string
  birthMonth: string
  birthDay: string
  citizenship: string
  ip?: string
  origin: string
}

export interface CardPaymentStarted {
  sessionId: string
  transactionId: string
  redirectUrl: string
}

export function settings() {
  const config = useRuntimeConfig()
  const accountId = cleanCredential(config.getmondoAccountId)
  const secret = cleanCredential(config.getmondoSecretKey)
  if (!accountId || !secret) {
    throw createError({ statusCode: 503, statusMessage: 'Card payments are not set up on the server yet' })
  }
  const mode = cleanCredential(config.getmondoMode).toUpperCase() === 'LIVE' ? 'LIVE' : 'SANDBOX'
  // Same safety idea as the other providers: live card payments move real money.
  if (mode === 'LIVE' && !isSwitchOn(config.allowLiveCards)) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Only the card sandbox is allowed. Live card payments are switched off',
    })
  }
  const force = cleanCredential(config.getmondoSandboxForce).toUpperCase()
  return {
    accountId,
    secret,
    mode: mode as 'LIVE' | 'SANDBOX',
    force: mode === 'SANDBOX' && (force === 'COMPLETED' || force === 'REJECTED') ? force : '',
  }
}

export function cardsConfigured(): boolean {
  const config = useRuntimeConfig()
  return cleanCredential(config.getmondoAccountId).length > 0 && cleanCredential(config.getmondoSecretKey).length > 0
}

/** The secret getMondo sends back with each webhook for one top-up. Worked out, never stored. */
export function webhookSecretFor(topupId: string): string {
  const s = settings()
  return createHmac('sha256', s.secret).update(`card-webhook:${topupId}`).digest('hex').slice(0, 48)
}

/** True when the webhook carries this top-up's secret, our account and our mode. */
export function webhookIsGenuine(body: Record<string, unknown>, topupId: string): boolean {
  const s = settings()
  const text = (v: unknown) => (typeof v === 'string' ? v : '')
  const digest = (v: string) => createHash('sha256').update(v).digest()
  const keyOk = timingSafeEqual(digest(text(body.COMPANY_WEBHOOK_KEY)), digest(webhookSecretFor(topupId)))
  const accountOk = text(body.COMPANY_ACCOUNT_ID) === s.accountId
  // A sandbox payment must never deliver real USDC, and the other way round.
  const modeOk = text(body.LIVE_OR_SANDBOX).toUpperCase() === s.mode
  return keyOk && accountOk && modeOk
}

function gatewayMessage(data: any): string {
  const m = data?.gateway_message || data?.message || data?.error_code
  return typeof m === 'string' && m ? m.slice(0, 200) : 'The card payment service did not accept the request'
}

async function post(path: string, fields: Record<string, string>, asForm: boolean): Promise<any> {
  const headers: Record<string, string> = {}
  let body: any
  if (asForm) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    body = new URLSearchParams(fields).toString()
  } else {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(fields)
  }
  return await $fetch<any>(`${BASE}${path}`, { method: 'POST', headers, body, timeout: 25_000 })
}

export async function startCardPayment(p: CardPaymentInput): Promise<CardPaymentStarted> {
  const s = settings()
  const fields: Record<string, string> = {
    company_account_id: s.accountId,
    gateway_secret_key: s.secret,
    transaction_currency_iso3: p.currency,
    transaction_amount: p.amount.toFixed(2),
    card_number: p.cardNumber,
    card_expiration_year: p.expYear,
    card_expiration_month: p.expMonth,
    card_security_code: p.cvv,
    cardholder_full_name: p.name,
    cardholder_email_address: p.email,
    cardholder_telephone_country_iso3: p.phoneCountry,
    cardholder_telephone_number: p.phone,
    cardholder_birth_year: p.birthYear,
    cardholder_birth_month: p.birthMonth,
    cardholder_birth_day: p.birthDay,
    cardholder_citizenship_country_iso3: p.citizenship,
    live_or_sandbox: s.mode,
    // No "?" in these: getMondo adds ?gateway_session_id=... itself.
    partner_return_url_completed: `${p.origin}/topup/card-return/completed`,
    partner_return_url_canceled: `${p.origin}/topup/card-return/canceled`,
    partner_return_url_rejected: `${p.origin}/topup/card-return/rejected`,
    partner_webhook_url: `${p.origin}/api/topup/card-webhook`,
    partner_webhook_secret: webhookSecretFor(p.sessionId),
    partner_session_id: p.sessionId,
  }
  if (p.ip) fields.cardholder_ip_address = p.ip
  if (s.force) fields.sandbox_force_transaction_status = s.force

  let data: any
  try {
    try {
      data = await post('/payment/', fields, false)
    } catch (err: any) {
      // If the API wanted form fields and reported every field as missing, nothing was
      // created, so asking again in that format cannot charge twice.
      const msg = String(err?.data?.gateway_message || '')
      if (Number(err?.statusCode) === 400 && /missing/i.test(msg) && /company_account_id/i.test(msg)) {
        data = await post('/payment/', fields, true)
      } else {
        throw err
      }
    }
  } catch (err: any) {
    // Never log the request: it holds the card number. Only what the gateway answered.
    console.error(
      'getMondo payment failed',
      Number(err?.statusCode) || 0,
      String(err?.data?.error_code || '').slice(0, 60),
      String(err?.data?.gateway_message || err?.message || '').slice(0, 160),
    )
    throw createError({
      statusCode: Number(err?.statusCode) >= 500 || !err?.statusCode ? 502 : 400,
      statusMessage: gatewayMessage(err?.data),
    })
  }

  const redirectUrl = String(data?.['3d_secure_redirect_url'] || '')
  const sessionId = String(data?.gateway_session_id || '')
  if (String(data?.transaction_status || '').toUpperCase() === 'FAILED' || !redirectUrl || !sessionId) {
    throw createError({ statusCode: 400, statusMessage: gatewayMessage(data) })
  }
  // Only send the customer to getMondo's own page.
  let host = ''
  try {
    host = new URL(redirectUrl).hostname
  } catch {
    host = ''
  }
  if (!/(^|\.)getmondo\.co$/i.test(host)) {
    throw createError({ statusCode: 502, statusMessage: 'The card payment service gave an unexpected address' })
  }
  return { sessionId, transactionId: String(data?.transaction_id || ''), redirectUrl }
}
