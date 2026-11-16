import { rateLimit, requireUser } from '../../utils/auth'
import { bestQuote } from '../../utils/meld'

// What a purchase would give: the best offer across Meld's payment providers. Reads only.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  rateLimit(user.id, 'meld-quote', 12, 60_000)
  const b = ((await readBody<Record<string, unknown>>(event)) || {}) as Record<string, unknown>
  const input = validate(b)
  const q = await bestQuote(input)
  return { usdc: q.destinationAmount, fee: q.totalFee, provider: q.serviceProvider }
})

function validate(b: Record<string, unknown>) {
  const max = Number(useRuntimeConfig().topupMaxEur) > 0 ? Number(useRuntimeConfig().topupMaxEur) : 50
  const amount = Math.round(Number(b.amount) * 100) / 100
  if (!Number.isFinite(amount) || amount < 1 || amount > max) {
    throw createError({ statusCode: 400, statusMessage: `Enter an amount from 1 to ${max}` })
  }
  const currency = typeof b.currency === 'string' ? b.currency.trim().toUpperCase() : ''
  if (!['EUR', 'USD', 'GBP'].includes(currency)) {
    throw createError({ statusCode: 400, statusMessage: 'Choose EUR, USD or GBP' })
  }
  const country = typeof b.country === 'string' ? b.country.trim().toUpperCase() : ''
  if (!/^[A-Z]{2}$/.test(country)) {
    throw createError({ statusCode: 400, statusMessage: 'Use a 2-letter country code, for example KE or GB' })
  }
  return { amount, currency, country }
}
