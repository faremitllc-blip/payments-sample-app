import { randomUUID } from 'node:crypto'
import { rateLimit, requireUser } from '../../utils/auth'
import { createTopupRow, getWalletRow, updateTopupRow } from '../../utils/db'
import { bestQuote, createWidgetSession } from '../../utils/meld'
import { siteOrigin } from '../../utils/openbanking'

// Starts a purchase of USDC through Meld. The USDC goes straight to the customer's own
// Mondo wallet address; Mondo does not hold or send the money.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  rateLimit(user.id, 'meld-start', 4, 60_000)
  const b = ((await readBody<Record<string, unknown>>(event)) || {}) as Record<string, unknown>

  const config = useRuntimeConfig()
  const max = Number(config.topupMaxEur) > 0 ? Number(config.topupMaxEur) : 50
  const amount = Math.round(Number(b.amount) * 100) / 100
  const currency = typeof b.currency === 'string' ? b.currency.trim().toUpperCase() : ''
  const country = typeof b.country === 'string' ? b.country.trim().toUpperCase() : ''
  if (!Number.isFinite(amount) || amount < 1 || amount > max) {
    throw createError({ statusCode: 400, statusMessage: `Enter an amount from 1 to ${max}` })
  }
  if (!['EUR', 'USD', 'GBP'].includes(currency)) {
    throw createError({ statusCode: 400, statusMessage: 'Choose EUR, USD or GBP' })
  }
  if (!/^[A-Z]{2}$/.test(country)) {
    throw createError({ statusCode: 400, statusMessage: 'Use a 2-letter country code, for example KE or GB' })
  }

  const wallet = await getWalletRow(user.id)
  if (!wallet) throw createError({ statusCode: 400, statusMessage: 'Create your wallet first' })
  // The purchase is made on Polygon, so only a wallet on Polygon can receive it.
  if (String(wallet.blockchain).toUpperCase() !== 'MATIC') {
    throw createError({ statusCode: 400, statusMessage: 'Your main wallet is not on Polygon' })
  }

  const quote = await bestQuote({ country, currency, amount })
  const id = randomUUID()
  await createTopupRow({
    id,
    user_id: user.id,
    currency,
    amount: amount.toFixed(2),
    status: 'waiting',
    method: 'meld',
    webform_id: null,
    payment_id: null,
    error: null,
  })
  try {
    const session = await createWidgetSession({
      quote,
      country,
      walletAddress: wallet.address,
      externalSessionId: id,
      externalCustomerId: user.id,
      redirectUrl: `${siteOrigin(event)}/topup/meld-return?id=${id}`,
    })
    await updateTopupRow(id, { webform_id: `meld:${session.id}` })
    return { id, widgetUrl: session.widgetUrl }
  } catch (err: any) {
    await updateTopupRow(id, {
      status: 'failed',
      error: String(err?.statusMessage || 'Could not start the purchase').slice(0, 240),
    })
    throw err
  }
})
