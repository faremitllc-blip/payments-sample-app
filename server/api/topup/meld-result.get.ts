import { requireUser } from '../../utils/auth'
import { getTopupRow, updateTopupRow } from '../../utils/db'
import { findStatus } from '../../utils/meld'

// How a purchase is going, for the page the customer returns to. Reads from Meld.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = String(getQuery(event).id || '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Purchase not found' })
  }
  const row = await getTopupRow(user.id, id)
  if (!row || !String(row.webform_id || '').startsWith('meld:')) {
    throw createError({ statusCode: 404, statusMessage: 'Purchase not found' })
  }
  if (row.status !== 'waiting') {
    return { status: row.status, usdc: row.usdc_amount != null ? Number(row.usdc_amount) : null }
  }
  try {
    const s = await findStatus(id)
    if (s.status === 'done') {
      await updateTopupRow(id, { status: 'credited', ...(s.usdc ? { usdc_amount: s.usdc } : {}) })
      return { status: 'credited', usdc: s.usdc }
    }
    if (s.status === 'stopped') {
      await updateTopupRow(id, { status: 'failed', error: s.providerStatus })
      return { status: 'failed', usdc: null }
    }
  } catch (err: any) {
    console.error('Meld result check failed', id, err?.statusMessage)
  }
  return { status: 'waiting', usdc: null }
})
