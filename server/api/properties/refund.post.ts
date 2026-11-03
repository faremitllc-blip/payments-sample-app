import { rateLimit, requireUser } from '../../utils/auth'
import { executeContract, isUuid, uuidFromSeed } from '../../utils/circle'
import { getProperty } from '../../utils/db'
import { poolSettings, poolWallet, readPosition, readSummary } from '../../utils/properties'

// Returns the user's USDC from a property that did not reach its target.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  rateLimit(user.id, 'property-refund', 5, 60_000)
  const pool = poolSettings()
  const body = (await readBody<{ propertyId?: unknown; requestId?: unknown }>(event)) || {}
  const property = isUuid(body.propertyId) ? await getProperty(body.propertyId) : null
  if (!property || !isUuid(body.requestId)) {
    throw createError({ statusCode: 400, statusMessage: 'Property and request id are required' })
  }
  const wallet = await poolWallet(user.id, pool)
  if (!wallet) {
    throw createError({ statusCode: 400, statusMessage: 'You have no wallet on the pool network' })
  }
  const summary = await readSummary(pool, property.onchain_id)
  const refundable =
    summary.status === 'failed' || (summary.status === 'open' && summary.deadline * 1000 <= Date.now())
  if (!refundable) {
    throw createError({ statusCode: 400, statusMessage: 'This property is not refundable' })
  }
  const position = await readPosition(pool, property.onchain_id, wallet.address)
  if (BigInt(position.invested) <= BigInt(0)) {
    throw createError({ statusCode: 400, statusMessage: 'You have nothing to refund' })
  }
  const tx = await executeContract({
    walletId: wallet.circleWalletId,
    contractAddress: pool.address,
    signature: 'refund(uint256)',
    params: [String(property.onchain_id)],
    idempotencyKey: uuidFromSeed(`refund:${user.id}:${body.requestId}`),
    refId: `refund:${property.id}`,
  })
  return { txId: tx.id, state: tx.state }
})
