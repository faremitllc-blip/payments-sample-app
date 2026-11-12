import { requireUser } from '../../utils/auth'
import { findTopupForReturn, updateTopupRow } from '../../utils/db'
import { checkPayment } from '../../utils/openbanking'

// Used by the page the bank sends the customer back to. It asks the payment service how the
// payment really ended, so a cancelled payment is never shown as a success.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const paymentId = String(getQuery(event).payment_id || '')
  const row = await findTopupForReturn(user.id, paymentId)
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Top-up not found' })
  }

  let status = row.status
  let error = row.error
  if (status === 'waiting' && row.webform_id) {
    try {
      const check = await checkPayment(row.id, row.webform_id)
      if (check.status !== 'waiting') {
        status = check.status
        error = check.error || null
        await updateTopupRow(row.id, { status, error, payment_id: check.paymentId || null })
      }
    } catch (err: any) {
      console.error('Top-up return check failed', row.id, err?.statusMessage)
    }
  }
  return { id: row.id, status, amount: Number(row.amount), error }
})
