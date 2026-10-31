import { rateLimit, requireUser } from '../../utils/auth'
import { isUuid } from '../../utils/circle'
import { createInvestmentRow, getProperty, listInvestmentRows } from '../../utils/db'
import { checkInvestAmount, newInvestState } from '../../utils/propertiesRules'
import {
  advanceInvestment,
  poolSettings,
  poolWallet,
  readSummary,
  usdcBalance,
} from '../../utils/properties'

// Starts an investment from the signed-in user's own wallet on the pool's network.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  rateLimit(user.id, 'invest-start', 5, 60_000)
  const pool = poolSettings()

  const body = (await readBody<{ propertyId?: unknown; amount?: unknown; requestId?: unknown }>(event)) || {}
  const requestId = isUuid(body.requestId) ? body.requestId : ''
  const propertyId = isUuid(body.propertyId) ? body.propertyId : ''
  if (!requestId || !propertyId) {
    throw createError({ statusCode: 400, statusMessage: 'Property and request id are required' })
  }

  const property = await getProperty(propertyId)
  if (!property) {
    throw createError({ statusCode: 404, statusMessage: 'Property not found' })
  }
  const wallet = await poolWallet(user.id, pool)
  if (!wallet) {
    throw createError({
      statusCode: 400,
      statusMessage: `Add your ${pool.chainLabel} wallet on the Bridge page first, then bridge some USDC to it`,
    })
  }

  // One investment in progress at a time per user.
  const recent = await listInvestmentRows(user.id)
  if (recent.some((r) => r.status === 'running' && r.id !== requestId)) {
    throw createError({ statusCode: 409, statusMessage: 'An investment is already in progress. Wait for it to finish' })
  }

  const summary = await readSummary(pool, property.onchain_id)
  if (summary.status !== 'open' || summary.deadline * 1000 <= Date.now()) {
    throw createError({ statusCode: 400, statusMessage: 'This property is not open for investment' })
  }
  const remaining = BigInt(summary.target) - BigInt(summary.raised)
  const balance = await usdcBalance(wallet.circleWalletId)
  const checked = checkInvestAmount({
    raw: body.amount,
    minUsdc: Number(property.min_invest_usdc),
    maxUsdc: pool.maxInvestUsdc,
    remainingMicro: (remaining > BigInt(0) ? remaining : BigInt(0)).toString(),
    balanceUsdc: balance,
  })
  if (!checked.ok) {
    throw createError({ statusCode: 400, statusMessage: checked.message })
  }

  const created = await createInvestmentRow({
    id: requestId,
    user_id: user.id,
    property_id: property.id,
    amount: checked.amount!,
    status: 'running',
    state: newInvestState() as unknown,
  })
  if (!created) {
    return { id: requestId, status: 'running', duplicate: true }
  }
  await advanceInvestment(user.id, requestId)
  return { id: requestId, status: 'running' }
})
