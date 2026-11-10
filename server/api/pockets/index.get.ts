import { requireUser } from '../../utils/auth'
import { getPockets } from '../../utils/pockets'

// USDC the user has set aside in each currency wallet.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const p = await getPockets(user.id)
  return { pockets: p.byCurrency, total: p.total }
})
