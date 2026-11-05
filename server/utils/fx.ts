import { CURRENCIES } from '../../utils/currencies'
import { memoGet, memoSet } from './memo'

export interface FxRates {
  base: 'USD'
  updatedAt: string
  rates: Record<string, number>
}

const CACHE_KEY = 'fx:xe:USD'
const CACHE_MS = 15 * 60_000

/**
 * Current XE mid-market rates for one US dollar. Mondo treats 1 USDC as 1 USD.
 * Cached for 15 minutes, so many people looking at the page cost one XE request.
 */
export async function getRates(): Promise<FxRates> {
  const cached = memoGet<FxRates>(CACHE_KEY)
  if (cached) return cached

  const config = useRuntimeConfig()
  const account = String(config.xeAccountId || '')
  const key = String(config.xeApiKey || '')
  if (!account || !key) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Exchange rates are not switched on yet. Add XE_ACCOUNT_ID and XE_API_KEY',
    })
  }

  const to = CURRENCIES.map((c) => c.code).join(',')
  let data: any
  try {
    data = await $fetch<any>('https://xecdapi.xe.com/v1/convert_from.json/', {
      query: { from: 'USD', to, amount: 1 },
      headers: { Authorization: `Basic ${Buffer.from(`${account}:${key}`).toString('base64')}` },
      timeout: 10_000,
    })
  } catch (err: any) {
    const status = Number(err?.statusCode) || 0
    console.error('XE rates request failed', status, String(err?.data?.message || err?.message || '').slice(0, 160))
    throw createError({
      statusCode: 502,
      statusMessage:
        status === 401 || status === 403
          ? 'XE did not accept the account ID or API key'
          : 'Exchange rates could not be loaded right now. Try again in a moment',
    })
  }

  const rates: Record<string, number> = {}
  for (const item of Array.isArray(data?.to) ? data.to : []) {
    const rate = Number(item?.mid)
    if (typeof item?.quotecurrency === 'string' && Number.isFinite(rate) && rate > 0) {
      rates[item.quotecurrency] = rate
    }
  }
  if (Object.keys(rates).length === 0) {
    throw createError({ statusCode: 502, statusMessage: 'XE returned no rates' })
  }

  const result: FxRates = {
    base: 'USD',
    updatedAt: typeof data?.timestamp === 'string' ? data.timestamp : new Date().toISOString(),
    rates,
  }
  memoSet(CACHE_KEY, result, CACHE_MS)
  return result
}
