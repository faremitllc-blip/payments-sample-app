import { rateLimit, requireUser } from '../../utils/auth'
import { allUsdcBalances } from '../../utils/crosschain'
import { getWalletRow, logPocketMove, savePocketRow } from '../../utils/db'
import { fromMicro, getPockets, toMicro } from '../../utils/pockets'
import { CURRENCIES } from '../../../utils/currencies'

// Sets USDC aside in a currency wallet, or moves it back. The USDC stays in the user's
// Mondo wallet; it is only reserved, so it cannot be spent until it is moved back.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  rateLimit(user.id, 'pocket-move', 10, 60_000)

  const body = (await readBody<{ currency?: unknown; amount?: unknown; direction?: unknown; source?: unknown }>(event)) || {}
  const currency = typeof body.currency === 'string' ? body.currency.trim().toUpperCase() : ''
  if (!CURRENCIES.some((c) => c.code === currency)) {
    throw createError({ statusCode: 400, statusMessage: 'Choose a currency wallet' })
  }
  const direction = body.direction === 'out' ? 'out' : 'in'
  const source = body.source === 'bank' ? 'bank' : 'usdc'
  const text = typeof body.amount === 'string' ? body.amount.trim() : ''
  if (!/^\d{1,9}(\.\d{1,6})?$/.test(text) || !(Number(text) > 0)) {
    throw createError({ statusCode: 400, statusMessage: 'Enter an amount like 5 or 5.25' })
  }
  const amount = toMicro(text)

  const wallet = await getWalletRow(user.id)
  if (!wallet) {
    throw createError({ statusCode: 404, statusMessage: 'Create your wallet first' })
  }
  const pockets = await getPockets(user.id)
  const current = toMicro(pockets.byCurrency[currency] || 0)

  let next: number
  if (direction === 'in') {
    const all = await allUsdcBalances(user.id, wallet)
    const available = toMicro(all.total) - toMicro(pockets.total)
    if (amount > available) {
      throw createError({
        statusCode: 400,
        statusMessage: `You can move up to ${fromMicro(Math.max(0, available))} USDC`,
      })
    }
    next = current + amount
  } else {
    if (amount > current) {
      throw createError({
        statusCode: 400,
        statusMessage: `Only ${fromMicro(current)} USDC is available in your ${currency} wallet`,
      })
    }
    next = current - amount
  }

  await savePocketRow(user.id, currency, fromMicro(next))
  try {
    await logPocketMove({ user_id: user.id, currency, direction, source, usdc: fromMicro(amount) })
  } catch (err: any) {
    // The balance is already saved; a missing log line must not undo it.
    console.error('Pocket move log failed', err?.statusMessage)
  }
  return { currency, usdc: fromMicro(next) }
})
