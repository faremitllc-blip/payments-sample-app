import { randomUUID } from 'node:crypto'
import { cleanCredential, isSwitchOn } from './clean'

/**
 * Server-side client for OwlPay Harbor: US bank (ACH) top-ups. The customer links a US bank
 * account once, then each top-up pulls USD from it and Harbor sends USDC straight to the
 * customer's own Mondo wallet. The API key comes from an environment variable only.
 */

const SANDBOX = 'https://harbor-sandbox.owlpay.com'
// The chain Mondo wallets live on.
const CHAIN = 'polygon'

export function achConfigured(): boolean {
  return cleanCredential(useRuntimeConfig().owlpayApiKey).length > 0
}

export function settings() {
  const config = useRuntimeConfig()
  const apiKey = cleanCredential(config.owlpayApiKey)
  if (!apiKey) {
    throw createError({ statusCode: 503, statusMessage: 'Bank (ACH) top-ups are not set up on the server yet' })
  }
  const baseUrl = (cleanCredential(config.owlpayBaseUrl) || SANDBOX).replace(/\/+$/, '')
  if (!/^https:\/\/[a-z0-9.-]+\.owlpay\.com$/i.test(baseUrl)) {
    throw createError({ statusCode: 503, statusMessage: 'The ACH service address is not valid' })
  }
  const sandbox = /sandbox/i.test(baseUrl)
  // Anything but the sandbox moves real money, so it needs an explicit switch.
  if (!sandbox && !isSwitchOn(config.allowLiveAch)) {
    throw createError({ statusCode: 503, statusMessage: 'Live ACH is switched off' })
  }
  return { apiKey, baseUrl, sandbox }
}

function refusal(err: any): string {
  const d = err?.data
  const parts: string[] = []
  const status = Number(err?.statusCode) || 0
  if (status) parts.push(`HTTP ${status}`)
  if (d && typeof d === 'object') {
    for (const k of ['message', 'error', 'code', 'error_code']) {
      if (d[k] !== undefined && typeof d[k] !== 'object' && String(d[k])) parts.push(String(d[k]))
    }
    if (d.errors && typeof d.errors === 'object') parts.push(JSON.stringify(d.errors).slice(0, 220))
  }
  if (parts.length <= 1 && err?.message) parts.push(String(err.message))
  return parts.join(': ').replace(/\s+/g, ' ').slice(0, 320) || 'The bank service did not accept the request'
}

async function call<T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
  const s = settings()
  try {
    return await $fetch<T>(`${s.baseUrl}${path}`, {
      method,
      headers: {
        'X-API-KEY': s.apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(method === 'POST' ? { 'X-Idempotency-Key': randomUUID() } : {}),
      },
      body: body as any,
      timeout: 25_000,
    })
  } catch (err: any) {
    const status = Number(err?.statusCode) || 0
    console.error('OwlPay request failed', method, path, status, JSON.stringify(err?.data || String(err?.message || '')).slice(0, 600))
    throw createError({ statusCode: status && status < 500 ? 400 : 502, statusMessage: refusal(err) })
  }
}

export interface AchCustomer {
  uuid: string
  status: string
  state: string
  agreementLink: string
  verificationLink: string
}

function shapeCustomer(d: any): AchCustomer {
  return {
    uuid: String(d?.uuid || ''),
    status: String(d?.status || ''),
    state: String(d?.state || ''),
    agreementLink: String(d?.agreement_link || ''),
    verificationLink: String(d?.verification_link || ''),
  }
}

export async function createCustomer(p: {
  firstName: string
  lastName: string
  email: string
  phone: string
  birthDate: string
}): Promise<AchCustomer> {
  const res = await call<{ data?: any }>('/api/v1/customers', 'POST', {
    type: 'individual',
    first_name: p.firstName,
    last_name: p.lastName,
    email: p.email,
    phone_country_code: 'US',
    phone_number: p.phone,
    birth_date: p.birthDate,
    description: 'Mondo customer',
  })
  const c = shapeCustomer(res?.data ?? res)
  if (!c.uuid) throw createError({ statusCode: 502, statusMessage: 'The bank service gave an unexpected answer' })
  return c
}

export async function getCustomer(uuid: string): Promise<AchCustomer> {
  const res = await call<{ data?: any }>(`/api/v1/customers/${encodeURIComponent(uuid)}`, 'GET')
  return shapeCustomer(res?.data ?? res)
}

export async function widgetUrl(uuid: string, successUrl: string): Promise<string> {
  const res = await call<{ data?: { widget_url?: string } }>(
    `/api/v1/customers/${encodeURIComponent(uuid)}/bank-connections/widget-url`,
    'POST',
    { redirect_url: { success: successUrl } },
  )
  const url = String(res?.data?.widget_url || '')
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    host = ''
  }
  // Only send the customer to OwlPay's own page.
  if (!/(^|\.)owlpay\.com$/i.test(host)) {
    throw createError({ statusCode: 502, statusMessage: 'The bank service gave an unexpected address' })
  }
  return url
}

export interface LinkedBank {
  id: string
  name: string
  type: string
  last4: string
  institution: string
  connected: boolean
}

export async function listLinkedBanks(uuid: string): Promise<LinkedBank[]> {
  const res = await call<{ data?: any[] }>(`/api/v1/customers/${encodeURIComponent(uuid)}/linked-bank-accounts`, 'GET')
  return (res?.data || [])
    .filter((b) => b && /^clbacc_[A-Za-z0-9]+$/.test(String(b.id || '')))
    .map((b) => ({
      id: String(b.id),
      name: String(b.name || 'Bank account'),
      type: String(b.type || ''),
      last4: String(b.last4_digits || ''),
      institution: String(b.institution_name || ''),
      connected: String(b.connection_status || '').toUpperCase() === 'CONNECTED',
    }))
}

/** The ACH pull quote that delivers `amount` USDC on Polygon. */
export async function achQuote(customerUuid: string, amount: number): Promise<{ id: string; usdc: number; usd: number }> {
  const res = await call<{ data?: any[] }>('/api/v2/transfers/quotes', 'POST', {
    on_behalf_of: customerUuid,
    source: { country: 'US', asset: 'USD', type: 'individual' },
    destination: { chain: CHAIN, asset: 'USDC', amount, type: 'individual' },
  })
  const q = (res?.data || []).find((x) => String(x?.payment_method || '').toUpperCase() === 'ACH_PULL')
  if (!q?.id) {
    throw createError({ statusCode: 404, statusMessage: 'Bank (ACH) payments are not available for this account or amount' })
  }
  return { id: String(q.id), usdc: Number(q.destination_amount), usd: Number(q.source_amount) }
}

/** The transfer rules for a quote (a JSON Schema). Used to fill in what the bank service asks for. */
export async function quoteRequirements(quoteId: string): Promise<any> {
  return await call<any>(`/api/v2/transfers/quotes/${encodeURIComponent(quoteId)}/requirements`, 'GET')
}

export interface AchTransfer {
  uuid: string
  status: string
  subStatus: string
  usdc: number | null
  txHash: string
}

function shapeTransfer(d: any): AchTransfer {
  const usdc = Number(d?.destination_amount ?? d?.destination?.amount)
  return {
    uuid: String(d?.uuid || ''),
    status: String(d?.status || ''),
    subStatus: String(d?.sub_status || ''),
    usdc: Number.isFinite(usdc) && usdc > 0 ? usdc : null,
    txHash: String(d?.receipt?.transaction_hash || ''),
  }
}

export async function createTransfer(body: unknown): Promise<AchTransfer> {
  const res = await call<{ data?: any }>('/api/v2/transfers', 'POST', body)
  const t = shapeTransfer(res?.data ?? res)
  if (!t.uuid) throw createError({ statusCode: 502, statusMessage: 'The bank service gave an unexpected answer' })
  return t
}

export async function getTransfer(uuid: string): Promise<AchTransfer> {
  const res = await call<{ data?: any }>(`/api/v2/transfers/${encodeURIComponent(uuid)}`, 'GET')
  return shapeTransfer(res?.data ?? res)
}

/** Sandbox only: moves a test transfer along so a whole top-up can be tried in minutes. */
export async function simulate(uuid: string, step: 'settled' | 'completed'): Promise<void> {
  if (!settings().sandbox) {
    throw createError({ statusCode: 400, statusMessage: 'Simulation works only in the sandbox' })
  }
  await call<unknown>(`/api/v1/transfers/${encodeURIComponent(uuid)}/simulate-${step}`, 'POST')
}

export function mapStatus(t: AchTransfer): 'waiting' | 'credited' | 'failed' | 'cancelled' {
  const s = t.status.toLowerCase()
  if (s === 'completed') return 'credited'
  if (s === 'cancelled' || s === 'canceled') return 'cancelled'
  if (['reject', 'rejected', 'expired', 'refunded', 'failed'].includes(s)) return 'failed'
  // pending_customer_transfer_start, pending_harbor, pending_external, on_hold
  return 'waiting'
}

/** Picks a transfer purpose the quote accepts, preferring a savings-like one. */
export function pickPurpose(schema: any): string {
  const found: string[] = []
  const walk = (node: any, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 8) return
    const p = node.properties?.transfer_purpose
    if (p) {
      if (Array.isArray(p.enum)) found.push(...p.enum.map(String))
      if (Array.isArray(p.oneOf)) found.push(...p.oneOf.map((o: any) => String(o?.const ?? '')).filter(Boolean))
    }
    for (const v of Object.values(node)) walk(v, depth + 1)
  }
  walk(schema, 0)
  for (const want of ['SAVINGS', 'INVESTMENT', 'PERSONAL_TRANSFER', 'FAMILY_SUPPORT', 'SALARY']) {
    if (found.includes(want)) return want
  }
  return found[0] || 'SAVINGS'
}
