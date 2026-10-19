import { requireUser } from '../utils/auth'
import { toActivityItems } from '../utils/activity'
import { listTransactions } from '../utils/circle'
import { getWalletRow } from '../utils/db'

// Recent activity (sent and received) for the signed-in user's wallet.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const wallet = await getWalletRow(user.id)
  if (!wallet) {
    return { transactions: [] }
  }

  const items = await listTransactions(wallet.circle_wallet_id)
  return { transactions: toActivityItems(items) }
})
