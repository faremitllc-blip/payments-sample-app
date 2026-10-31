import { rateLimit, requireUser } from '../../utils/auth'
import { requireApprovedCustomer } from '../../utils/bank'
import { bridgeRequest } from '../../utils/bridge'

// Gives the user Bridge's page for the extra approval needed for euro accounts
// (proof of address). Bridge documents this link only for "sepa".
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  rateLimit(user.id, 'bank-endorsement', 5, 60_000)

  const body = (await readBody<{ endorsement?: unknown }>(event)) || {}
  if (body.endorsement !== 'sepa') {
    throw createError({
      statusCode: 400,
      statusMessage: 'This extra approval is available for euro accounts only',
    })
  }

  const { status } = await requireApprovedCustomer(user.id)
  const redirect = encodeURIComponent(`${getRequestURL(event).origin}/verify?done=1`)
  const result = await bridgeRequest<{ url?: string }>(
    `/customers/${encodeURIComponent(status.customerId)}/kyc_link?endorsement=sepa&redirect_uri=${redirect}`,
  )
  if (!result.url) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Bridge did not return a link',
    })
  }
  return { url: result.url }
})
