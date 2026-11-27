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
    // Validation answers repeat themselves; show the missing field names once, up front.
    const raw = JSON.stringify(d)
    const missing = new Set<string>()
    for (const m of raw.matchAll(/required properties \(([^)]*)\) (?:are|is) missing/g)) {
      m[1].split(',').forEach((n) => n.trim() && missing.add(n.trim()))
    }
    if (missing.size) parts.push(`Missing fields: ${[...missing].join(', ')}`)
    else if (d.errors && typeof d.errors === 'object') parts.push(JSON.stringify(d.errors).slice(0, 220))
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
    console.error('OwlPay request failed', method, path, status, JSON.stringify(err?.data || String(err?.message || '')).slice(0, 1500))
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

/** Every field name the transfer rules mark as required, and whether it sits inside beneficiary_info. */
function requiredNames(schema: any): Map<string, boolean> {
  const out = new Map<string, boolean>()
  const walk = (node: any, inInfo: boolean, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 12) return
    if (Array.isArray(node.required)) node.required.forEach((n: unknown) => typeof n === 'string' && !out.has(n) && out.set(n, inInfo))
    for (const [k, v] of Object.entries(node)) walk(v, inInfo || k === 'beneficiary_info', depth + 1)
  }
  walk(schema, false, 0)
  return out
}

/** The allowed values the rules list for one field, if any. */
function allowedValues(schema: any, field: string): string[] {
  const found: string[] = []
  const walk = (node: any, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 10) return
    const p = node.properties?.[field]
    if (p) {
      if (Array.isArray(p.enum)) found.push(...p.enum.map(String))
      if (Array.isArray(p.oneOf)) found.push(...p.oneOf.map((o: any) => String(o?.const ?? '')).filter(Boolean))
    }
    for (const v of Object.values(node)) walk(v, depth + 1)
  }
  walk(schema, 0)
  return found
}

export interface CustomerRecord {
  address: Record<string, string> | null
  birthDate: string
  idNumber: string
}

/** What the bank service already holds about the customer (address, date of birth, ID number). */
export async function customerRecord(uuid: string): Promise<CustomerRecord> {
  const res = await call<{ data?: any }>(`/api/v1/customers/${encodeURIComponent(uuid)}`, 'GET')
  const d = res?.data ?? res
  const a = d?.address || d?.residential_address || d?.beneficiary_address
  let address: Record<string, string> | null = null
  if (a && typeof a === 'object') {
    const street = String(a.street || a.line1 || a.address_line_1 || '')
    const city = String(a.city || '')
    const postal = String(a.postal_code || a.zip || '')
    if (street && city && postal) {
      address = { street, city, state_province: String(a.state_province || a.state || ''), postal_code: postal, country: String(a.country || 'US') }
    }
  }
  const dob = String(d?.birth_date || d?.date_of_birth || d?.dob || '').slice(0, 10)
  const idNumber = String(d?.id_number || d?.id_doc_number || d?.identity_number || d?.tax_id || '')
  return { address, birthDate: /^\d{4}-\d{2}-\d{2}$/.test(dob) ? dob : '', idNumber }
}

/**
 * The extra destination fields this route asks for. Mondo wallets are held for the customer by
 * Circle, so the wallet counts as custodial. The sandbox falls back to test values for details
 * Mondo does not collect yet; live mode stops instead of inventing identity data.
 */
export function extraDestination(schema: any, rec: CustomerRecord): { top: Record<string, unknown>; info: Record<string, unknown> } {
  const need = requiredNames(schema)
  const top: Record<string, unknown> = {}
  const info: Record<string, unknown> = {}
  const put = (name: string, value: unknown, defaultInfo: boolean) => {
    ;(need.get(name) ?? defaultInfo ? info : top)[name] = value
  }
  const sandbox = settings().sandbox
  const missing = (what: string) =>
    createError({ statusCode: 400, statusMessage: `The bank service needs your ${what}, which is not on file yet` })

  if (need.has('beneficiary_receiving_wallet_type')) {
    const opts = allowedValues(schema, 'beneficiary_receiving_wallet_type')
    put('beneficiary_receiving_wallet_type', opts.find((o) => /custodial/i.test(o) && !/non/i.test(o)) || (opts.length ? opts[0] : 'custodial'), false)
  }
  if (need.has('beneficiary_institution_name')) put('beneficiary_institution_name', 'Mondo', false)
  if (need.has('beneficiary_address')) {
    if (rec.address) put('beneficiary_address', rec.address, true)
    else if (sandbox) put('beneficiary_address', { street: '123 Main St', city: 'Austin', state_province: 'TX', postal_code: '78701', country: 'US' }, true)
    else throw missing('home address')
  }
  if (need.has('beneficiary_dob')) {
    if (rec.birthDate) put('beneficiary_dob', rec.birthDate, true)
    else if (sandbox) put('beneficiary_dob', '1990-01-01', true)
    else throw missing('date of birth')
  }
  if (need.has('beneficiary_id_doc_number')) {
    if (rec.idNumber) put('beneficiary_id_doc_number', rec.idNumber, true)
    else if (sandbox) put('beneficiary_id_doc_number', '123456789', true)
    else throw missing('ID document number')
  }
  return { top, info }
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
