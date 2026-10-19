import { requireUser } from '../utils/auth'
import { toActivityItems } from '../utils/activity'
import { getBalances, isUsdc, listTransactions } from '../utils/circle'
import { getWalletRow } from '../utils/db'

// Everything the home screen needs in one trip: the wallet, its USDC balance
// and recent activity. The balance and activity are fetched at the same time.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const wallet = await getWalletRow(user.id)
  if (!wallet) {
    return { wallet: null, usdc: '0', transactions: [] }
  }

  const [balances, items] = await Promise.all([
    getBalances(wallet.circle_wallet_id),
    listTransactions(wallet.circle_wallet_id),
  ])
  const usdc = balances.find(isUsdc)

  return {
    wallet: { address: wallet.address, blockchain: wallet.blockchain },
    usdc: usdc ? usdc.amount : '0',
    transactions: toActivityItems(items),
  }
})
