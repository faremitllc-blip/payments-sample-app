import { requireUser } from '../../utils/auth'
import { getTopupRow, updateTopupRow } from '../../utils/db'
import { checkPayment } from '../../utils/openbanking'

// How a euro top-up is going. Asks the bank service while it is still waiting.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = String(getQuery(event).id || '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Top-up not found' })
  }
  const row = await getTopupRow(user.id, id)
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Top-up not found' })
  }

  let status = row.status
  let error = row.error
  if (status === 'waiting' && row.webform_id) {
    const expired = Date.now() - new Date(row.created_at || Date.now()).getTime() > 25 * 60_000
    try {
      const check = await checkPayment(row.id, row.webform_id)
      if (check.status !== 'waiting') {
        status = check.status
        error = check.error || null
        await updateTopupRow(row.id, { status, error, payment_id: check.paymentId || null })
      } else if (expired) {
        status = 'cancelled'
        error = 'The payment link expired'
        await updateTopupRow(row.id, { status, error })
      }
    } catch (err: any) {
      // A temporary problem reading the status should not mark the payment as failed.
      console.error('Top-up status check failed', row.id, err?.statusMessage)
    }
  }
  return { id: row.id, status, amount: Number(row.amount), currency: row.currency, error }
})
