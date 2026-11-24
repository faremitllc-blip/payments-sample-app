import { rateLimit, requireUser } from '../../utils/auth'
import { getAchCustomer } from '../../utils/db'
import { siteOrigin } from '../../utils/openbanking'
import { getCustomer, widgetUrl } from '../../utils/owlpay'

// Opens the bank service's page where the customer links a US bank account.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  rateLimit(user.id, 'ach-link', 6, 60_000)
  const uuid = await getAchCustomer(user.id)
  if (!uuid) throw createError({ statusCode: 400, statusMessage: 'Set up your profile first' })
  const customer = await getCustomer(uuid)
  if (customer.status !== 'verified') {
    throw createError({ statusCode: 400, statusMessage: 'Finish the identity check first' })
  }
  const url = await widgetUrl(uuid, `${siteOrigin(event)}/topup/ach?linked=1`)
  return { url }
})
