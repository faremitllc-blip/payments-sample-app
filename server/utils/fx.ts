import { CURRENCIES } from '../../utils/currencies'
import { memoGet, memoSet } from './memo'

export interface FxRates {
  base: 'USD'
  updatedAt: string
  rates: Record<string, number>
}

const CACHE_KEY = 'fx:frankfurter:USD'
const CACHE_MS = 60 * 60_000

/**
 * Current rates for one US dollar from Frankfurter (central bank and official
 * sources, updated daily, no key needed). Mondo treats 1 USDC as 1 US dollar.
 * Cached for an hour, so many people looking at the page cost one request.
 * A currency Frankfurter does not cover is simply left out of `rates`.
 */
export async function getRates(): Promise<FxRates> {
  const cached = memoGet<FxRates>(CACHE_KEY)
  if (cached) return cached

  const quotes = CURRENCIES.map((c) => c.code).join(',')
  let data: any
  try {
    data = await $fetch<any>('https://api.frankfurter.dev/v2/rates', {
      query: { base: 'USD', quotes },
      timeout: 10_000,
    })
  } catch (err: any) {
    console.error('Rates request failed', Number(err?.statusCode) || 0, String(err?.data?.message || err?.message || '').slice(0, 160))
    throw createError({
      statusCode: 502,
      statusMessage: 'Exchange rates could not be loaded right now. Try again in a moment',
    })
  }

  // The current format is a list of { date, base, quote, rate }. The older
  // format { date, rates: { KES: 129.1 } } is understood too.
  const rates: Record<string, number> = {}
  let date = ''
  if (Array.isArray(data)) {
    for (const item of data) {
      const rate = Number(item?.rate)
      if (typeof item?.quote === 'string' && item.quote !== 'USD' && Number.isFinite(rate) && rate > 0) {
        rates[item.quote] = rate
      }
      if (!date && typeof item?.date === 'string') date = item.date
    }
  } else if (data && typeof data.rates === 'object' && data.rates) {
    for (const [code, value] of Object.entries(data.rates)) {
      const rate = Number(value)
      if (Number.isFinite(rate) && rate > 0) rates[code] = rate
    }
    if (typeof data.date === 'string') date = data.date
  }
  if (Object.keys(rates).length === 0) {
    throw createError({ statusCode: 502, statusMessage: 'The rate service returned no rates' })
  }

  const result: FxRates = { base: 'USD', updatedAt: date || new Date().toISOString().slice(0, 10), rates }
  memoSet(CACHE_KEY, result, CACHE_MS)
  return result
}
