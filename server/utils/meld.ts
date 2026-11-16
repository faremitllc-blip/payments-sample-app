import { cleanCredential, isSwitchOn } from './clean'

/**
 * Server-side client for Meld (fiat-to-crypto on-ramp). Meld routes the purchase to the
 * best payment provider for the customer's country. The USDC is sent straight from the
 * provider to the customer's own Mondo wallet address, so Mondo never handles card data
 * or the money itself. The API key comes from an environment variable only.
 */

export interface MeldQuote {
  serviceProvider: string
  sourceAmount: number
  sourceCurrencyCode: string
  destinationAmount: number
  destinationCurrencyCode: string
  totalFee: number | null
}

export interface MeldSession {
  id: string
  widgetUrl: string
}

export interface MeldStatus {
  status: 'waiting' | 'done' | 'stopped'
  providerStatus: string
  usdc: number | null
}

export function settings() {
  const config = useRuntimeConfig()
  const apiKey = cleanCredential(config.meldApiKey)
  if (!apiKey) {
    throw createError({ statusCode: 503, statusMessage: 'Buying crypto is not set up on the server yet' })
  }
  const live = cleanCredential(config.meldMode).toUpperCase() === 'LIVE'
  // Real card payments: switched off unless allowed on purpose.
  if (live && !isSwitchOn(config.allowLiveOnramp)) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Only the Meld sandbox is allowed. Live buying is switched off',
    })
  }
  return {
    apiKey,
    live,
    baseUrl: live ? 'https://api.meld.io' : 'https://api-sb.meld.io',
    destination: cleanCredential(config.meldDestCurrency) || 'USDC_POLYGON',
  }
}

export function meldConfigured(): boolean {
  return cleanCredential(useRuntimeConfig().meldApiKey).length > 0
}

function refusal(err: any): string {
  const d = err?.data
  const parts: string[] = []
  if (d && typeof d === 'object') {
    for (const key of ['message', 'error', 'code', 'detail']) {
      if (typeof d[key] === 'string' && d[key]) parts.push(d[key])
    }
  }
  const text = parts.join(' | ').replace(/\s+/g, ' ').slice(0, 200)
  return text || 'The buying service did not accept the request'
}

async function call<T>(path: string, options: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
  const s = settings()
  try {
    return await $fetch<T>(`${s.baseUrl}${path}`, {
      method: options.method || 'GET',
      headers: { Authorization: `BASIC ${s.apiKey}`, 'Content-Type': 'application/json' },
      body: options.body as any,
      timeout: 20_000,
    })
  } catch (err: any) {
    const status = Number(err?.statusCode) || 0
    console.error('Meld request failed', path, status, JSON.stringify(err?.data || '').slice(0, 400))
    throw createError({ statusCode: status && status < 500 ? 400 : 502, statusMessage: refusal(err) })
  }
}

/** The quote with the most USDC for the money, from whichever provider offers it. */
export async function bestQuote(input: {
  country: string
  currency: string
  amount: number
}): Promise<MeldQuote> {
  const s = settings()
  const res = await call<{ quotes?: any[] }>('/payments/crypto/quote', {
    method: 'POST',
    body: {
      countryCode: input.country,
      sourceCurrencyCode: input.currency,
      destinationCurrencyCode: s.destination,
      sourceAmount: input.amount.toFixed(2),
    },
  })
  const quotes: MeldQuote[] = (res?.quotes || [])
    .filter((q) => q && typeof q.serviceProvider === 'string' && Number(q.destinationAmount) > 0)
    .map((q) => ({
      serviceProvider: q.serviceProvider,
      sourceAmount: Number(q.sourceAmount),
      sourceCurrencyCode: String(q.sourceCurrencyCode || input.currency),
      destinationAmount: Number(q.destinationAmount),
      destinationCurrencyCode: String(q.destinationCurrencyCode || s.destination),
      totalFee: Number.isFinite(Number(q.totalFee)) ? Number(q.totalFee) : null,
    }))
  if (quotes.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Buying USDC is not available for this country or amount right now',
    })
  }
  quotes.sort((a, b) => b.destinationAmount - a.destinationAmount)
  return quotes[0]
}

export async function createWidgetSession(input: {
  quote: MeldQuote
  country: string
  walletAddress: string
  externalSessionId: string
  externalCustomerId: string
  redirectUrl: string
}): Promise<MeldSession> {
  const s = settings()
  const res = await call<{ id?: string; widgetUrl?: string }>('/crypto/session/widget', {
    method: 'POST',
    body: {
      sessionType: 'BUY',
      sessionData: {
        serviceProvider: input.quote.serviceProvider,
        countryCode: input.country,
        sourceCurrencyCode: input.quote.sourceCurrencyCode,
        sourceAmount: input.quote.sourceAmount.toFixed(2),
        destinationCurrencyCode: s.destination,
        walletAddress: input.walletAddress,
        redirectUrl: input.redirectUrl,
      },
      externalSessionId: input.externalSessionId,
      externalCustomerId: input.externalCustomerId,
    },
  })
  const url = String(res?.widgetUrl || '')
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    host = ''
  }
  // Only send the customer to Meld's own page.
  if (!res?.id || !/(^|\.)meld\.io$/i.test(host)) {
    throw createError({ statusCode: 502, statusMessage: 'The buying service gave an unexpected address' })
  }
  return { id: String(res.id), widgetUrl: url }
}

/** Looks up how the purchase for one of our sessions is going. Only reads. */
export async function findStatus(externalSessionId: string): Promise<MeldStatus> {
  const query =
    `externalSessionIds=${encodeURIComponent(externalSessionId)}` +
    `&externalSessionId=${encodeURIComponent(externalSessionId)}`
  const res = await call<{ transactions?: any[] }>(`/payments/transactions?${query}`)
  // If a filter was ignored the list holds other people's purchases, so match our own id.
  const tx = (res?.transactions || []).find((t) => t && t.externalSessionId === externalSessionId)
  if (!tx) return { status: 'waiting', providerStatus: 'NOT_STARTED', usdc: null }
  const status = String(tx.status || '').toUpperCase()
  const usdc = Number(tx.destinationAmount)
  if (status === 'SETTLED') {
    return { status: 'done', providerStatus: status, usdc: Number.isFinite(usdc) && usdc > 0 ? usdc : null }
  }
  if (['FAILED', 'DECLINED', 'CANCELLED', 'CANCELED', 'REFUNDED', 'AUTHORIZATION_EXPIRED'].includes(status)) {
    return { status: 'stopped', providerStatus: status, usdc: null }
  }
  return { status: 'waiting', providerStatus: status, usdc: null }
}
