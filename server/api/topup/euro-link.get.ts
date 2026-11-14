import { requireUser } from '../../utils/auth'
import { getTopupByCode } from '../../utils/db'
import { webformLink } from '../../utils/finapi'

// Used by the Mondo payment page (/pay/<code>). Gives the bank page address only to
// the person who started the top-up, and only while the payment is still open.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const code = String(getQuery(event).code || '').toLowerCase()
  if (!/^[a-z0-9]{8}$/.test(code)) {
    throw createError({ statusCode: 404, statusMessage: 'This payment link was not found' })
  }
  const row = await getTopupByCode(user.id, code)
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'This payment link was not found' })
  }

  const expiresAt = new Date(new Date(row.created_at || Date.now()).getTime() + 20 * 60_000)
  const open = row.status === 'waiting' && row.webform_id && expiresAt.getTime() > Date.now()
  return {
    id: row.id,
    status: open ? 'waiting' : row.status === 'waiting' ? 'cancelled' : row.status,
    amount: Number(row.amount),
    expiresAt: expiresAt.toISOString(),
    url: open ? webformLink(String(row.webform_id)) : '',
  }
})
