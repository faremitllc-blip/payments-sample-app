import { requireUser } from '../../utils/auth'
import { getBalances, isUsdc } from '../../utils/circle'
import { allUsdcBalances } from '../../utils/crosschain'
import { getWalletRow } from '../../utils/db'

// USDC balance and any other token balances for the signed-in user's wallet.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const wallet = await getWalletRow(user.id)
  if (!wallet) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Create your wallet first',
    })
  }

  const [balances, all] = await Promise.all([
    getBalances(wallet.circle_wallet_id),
    allUsdcBalances(user.id, wallet),
  ])
  const usdc = balances.find(isUsdc)

  return {
    usdc: all.total,
    mainUsdc: usdc ? usdc.amount : '0',
    balances: all.wallets,
    others: balances
      .filter((b) => !isUsdc(b))
      .map((b) => ({
        symbol: b.token.symbol || 'Token',
        amount: b.amount,
      })),
  }
})
