import { requireUser } from '../../utils/auth'
import { getProperty, listInvestmentRows } from '../../utils/db'
import { investSteps, microToUsdc, readInvestState } from '../../utils/propertiesRules'
import { poolSettings, poolWallet, readPosition, readSummary, usdcBalance } from '../../utils/properties'

// One property: its description, funding progress, and the signed-in user's position.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = String(getRouterParam(event, 'id') || '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Property not found' })
  }
  const pool = poolSettings()
  const property = await getProperty(id)
  if (!property) {
    throw createError({ statusCode: 404, statusMessage: 'Property not found' })
  }

  const wallet = await poolWallet(user.id, pool)
  const [summary, position, balance, investments] = await Promise.all([
    readSummary(pool, property.onchain_id),
    wallet ? readPosition(pool, property.onchain_id, wallet.address).catch(() => null) : null,
    wallet ? usdcBalance(wallet.circleWalletId).catch(() => null) : null,
    listInvestmentRows(user.id, property.id),
  ])

  const target = BigInt(summary.target)
  const raised = BigInt(summary.raised)
  return {
    property: {
      id: property.id,
      title: property.title,
      location: property.location,
      description: property.description,
      imageUrl: property.image_url,
      expectedReturn: property.expected_return,
      minInvestUsdc: Number(property.min_invest_usdc),
    },
    chain: {
      status: summary.status,
      target: microToUsdc(summary.target),
      raised: microToUsdc(summary.raised),
      remaining: microToUsdc(target > raised ? target - raised : BigInt(0)),
      deadline: summary.deadline,
      released: summary.released,
      distributed: microToUsdc(summary.distributed),
    },
    pool: {
      chain: pool.chain,
      chainLabel: pool.chainLabel,
      address: pool.address,
      maxInvestUsdc: pool.maxInvestUsdc,
      live: pool.live,
    },
    wallet: wallet ? { address: wallet.address, balanceUsdc: balance } : null,
    position: position
      ? {
          invested: microToUsdc(position.invested),
          claimable: microToUsdc(position.claimable),
          claimed: microToUsdc(position.claimed),
        }
      : null,
    investments: investments.map((i) => ({
      id: i.id,
      amount: i.amount,
      status: i.status,
      error: i.error || null,
      steps: investSteps(readInvestState(i.state)),
      createdAt: i.created_at,
    })),
  }
})
