import { requireUser } from '../../utils/auth'
import { refreshBankStatus } from '../../utils/bank'
import { bridgeMode } from '../../utils/bridge'
import { getBankCustomer, listBankAccounts } from '../../utils/db'

// The signed-in user's bank page data: verification state and their accounts.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const mode = bridgeMode()
  if (!mode.configured) {
    return { configured: false, live: false, status: null, accounts: [] }
  }

  const row = await getBankCustomer(user.id)
  // Screens may reuse a very recent answer. "Check again" buttons ask with ?fresh=1.
  const fresh = String(getQuery(event).fresh || '') === '1'
  const status = row ? await refreshBankStatus(row, { cached: !fresh }) : null
  const accounts = await listBankAccounts(user.id)

  return {
    configured: true,
    live: mode.live,
    status,
    accounts: accounts.map((a) => ({
      currency: a.currency,
      instructions: a.deposit_instructions,
      placeholder: Boolean(a.placeholder),
    })),
  }
})
