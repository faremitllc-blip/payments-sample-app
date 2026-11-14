import { isUuid } from '../../utils/circle'
import { deliverCardTopup } from '../../utils/cardTopup'
import { claimTopup, getTopupById, updateTopupRow } from '../../utils/db'
import { webhookIsGenuine } from '../../utils/getmondo'

// getMondo calls this when a card payment changes status. It is public, so every call is
// checked against the secret made for that one top-up before anything happens.
export default defineEventHandler(async (event) => {
  const body = ((await readBody<Record<string, unknown>>(event)) || {}) as Record<string, unknown>
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

  const id = text(body.PARTNER_SESSION_ID)
  if (!isUuid(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown payment' })
  }
  const row = await getTopupById(id)
  if (!row || row.method !== 'card') {
    throw createError({ statusCode: 404, statusMessage: 'Unknown payment' })
  }
  if (!webhookIsGenuine(body, id)) {
    console.error('Card webhook refused', id)
    throw createError({ statusCode: 401, statusMessage: 'Not allowed' })
  }

  const status = text(body.TRANSACTION_STATUS).toUpperCase()
  const code = text(body.TRANSACTION_STATUS_CODE)
  if (status === 'COMPLETED' && code === '000.000.000') {
    if (await claimTopup(id, 'waiting', 'paid')) {
      if (text(body.TRANSACTION_ID)) {
        await updateTopupRow(id, { payment_id: text(body.TRANSACTION_ID) })
      }
      await deliverCardTopup(id)
    }
  } else if (status === 'CANCELED' || status === 'CANCELLED') {
    await claimTopup(id, 'waiting', 'cancelled')
  } else if (status === 'REJECTED' || status === 'FAILED' || status === 'COMPLETED') {
    await claimTopup(id, 'waiting', 'failed', {
      error: text(body.TRANSACTION_STATUS_MESSAGE).slice(0, 200) || 'The card payment was not accepted',
    })
  }
  return { ok: true }
})
