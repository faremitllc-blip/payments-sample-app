import { requireUser } from '../../utils/auth'
import { getTopupBySession } from '../../utils/db'

// How a card top-up is going, for the page the customer returns to. Only reads.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const session = String(getQuery(event).gateway_session_id || '')
  if (!/^[0-9a-zA-Z_-]{6,100}$/.test(session)) {
    throw createError({ statusCode: 404, statusMessage: 'Payment not found' })
  }
  const row = await getTopupBySession(user.id, session)
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Payment not found' })
  }
  return {
    id: row.id,
    status: row.status,
    amount: Number(row.amount),
    usdc: row.usdc_amount != null ? Number(row.usdc_amount) : null,
  }
})
