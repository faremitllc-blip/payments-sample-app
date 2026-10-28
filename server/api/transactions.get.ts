import { requireUser } from '../utils/auth'
import { toActivityItems } from '../utils/activity'
import { allTransactions } from '../utils/crosschain'
import { getWalletRow } from '../utils/db'

// Recent activity (sent and received) across all of the signed-in user's wallets.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const wallet = await getWalletRow(user.id)
  if (!wallet) {
    return { transactions: [] }
  }

  const items = await allTransactions(user.id, wallet)
  return { transactions: toActivityItems(items) }
})
