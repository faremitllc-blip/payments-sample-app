import { requireUser } from '../utils/auth'
import { toActivityItems } from '../utils/activity'
import { getBalances, isUsdc, listTransactions } from '../utils/circle'
import { allUsdcBalances } from '../utils/crosschain'
import { getWalletRow } from '../utils/db'

// Everything the home screen needs in one trip: the wallet, its USDC balance
// and recent activity. The balance and activity are fetched at the same time.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const wallet = await getWalletRow(user.id)
  if (!wallet) {
    return { wallet: null, usdc: '0', mainUsdc: '0', balances: [], transactions: [] }
  }

  const [balances, items, all] = await Promise.all([
    getBalances(wallet.circle_wallet_id),
    listTransactions(wallet.circle_wallet_id),
    allUsdcBalances(user.id, wallet),
  ])
  const usdc = balances.find(isUsdc)

  return {
    wallet: { address: wallet.address, blockchain: wallet.blockchain },
    // Total across every network wallet. Sending still uses the main wallet only.
    usdc: all.total,
    mainUsdc: usdc ? usdc.amount : '0',
    balances: all.wallets,
    transactions: toActivityItems(items),
  }
})
