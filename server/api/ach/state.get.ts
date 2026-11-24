import { rateLimit, requireUser } from '../../utils/auth'
import { getAchCustomer } from '../../utils/db'
import { achConfigured, getCustomer, listLinkedBanks, settings } from '../../utils/owlpay'

// Where the customer is in setting up US bank (ACH) top-ups: profile, identity check, linked banks.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  rateLimit(user.id, 'ach-state', 30, 60_000)
  if (!achConfigured()) return { configured: false }

  const s = settings()
  const uuid = await getAchCustomer(user.id)
  if (!uuid) return { configured: true, sandbox: s.sandbox, customer: null, banks: [] }

  const customer = await getCustomer(uuid)
  const verified = customer.status === 'verified'
  const banks = verified ? await listLinkedBanks(uuid).catch(() => []) : []
  return {
    configured: true,
    sandbox: s.sandbox,
    customer: {
      status: customer.status,
      state: customer.state,
      verified,
      agreementLink: customer.agreementLink,
      verificationLink: customer.verificationLink,
    },
    banks,
  }
})
