import { rateLimit, requireUser } from '../../utils/auth'
import { executeContract, isUuid, uuidFromSeed } from '../../utils/circle'
import { getProperty } from '../../utils/db'
import { poolSettings, poolWallet, readPosition } from '../../utils/properties'

// Pays the user's share of rent / sale proceeds to their own wallet.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  rateLimit(user.id, 'property-claim', 5, 60_000)
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
  const position = await readPosition(pool, property.onchain_id, wallet.address)
  if (BigInt(position.claimable) <= BigInt(0)) {
    throw createError({ statusCode: 400, statusMessage: 'You have nothing to claim yet' })
  }
  const tx = await executeContract({
    walletId: wallet.circleWalletId,
    contractAddress: pool.address,
    signature: 'claim(uint256)',
    params: [String(property.onchain_id)],
    idempotencyKey: uuidFromSeed(`claim:${user.id}:${body.requestId}`),
    refId: `claim:${property.id}`,
  })
  return { txId: tx.id, state: tx.state }
})
