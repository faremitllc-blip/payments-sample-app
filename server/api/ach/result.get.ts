import { rateLimit, requireUser } from '../../utils/auth'
import { getTopupRow, updateTopupRow } from '../../utils/db'
import { getTransfer, mapStatus } from '../../utils/owlpay'

// How an ACH top-up is going. Reads the real status from the bank service each time.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  rateLimit(user.id, 'ach-result', 60, 60_000)
  const id = String(getQuery(event).id || '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw createError({ statusCode: 404, statusMessage: 'Top-up not found' })
  const row = await getTopupRow(user.id, id)
  const ref = String(row?.webform_id || '')
  if (!row || !ref.startsWith('ow:')) throw createError({ statusCode: 404, statusMessage: 'Top-up not found' })

  const amount = Number(row.amount)
  if (row.status !== 'waiting') {
    return { status: row.status, amount, usdc: row.usdc_amount != null ? Number(row.usdc_amount) : null, error: row.error }
  }
  const t = await getTransfer(ref.slice(3))
  const status = mapStatus(t)
  if (status === 'waiting') {
    return { status, amount, usdc: row.usdc_amount != null ? Number(row.usdc_amount) : null, step: t.status, subStep: t.subStatus, transfer: t.uuid }
  }
  await updateTopupRow(id, {
    status,
    ...(t.usdc ? { usdc_amount: t.usdc } : {}),
    ...(t.txHash ? { usdc_tx: t.txHash } : {}),
    ...(status === 'failed' || status === 'cancelled' ? { error: `The bank payment ended as "${t.status}"` } : {}),
  })
  return { status, amount, usdc: t.usdc, error: status === 'credited' ? null : `The bank payment ended as "${t.status}"` }
})
