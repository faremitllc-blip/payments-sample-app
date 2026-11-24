import { rateLimit, requireUser } from '../../utils/auth'
import { getTopupRow } from '../../utils/db'
import { simulate } from '../../utils/owlpay'

// Sandbox only: moves a test top-up along ("bank confirmed", then "finished").
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  rateLimit(user.id, 'ach-simulate', 20, 60_000)
  const b = ((await readBody<{ id?: unknown; step?: unknown }>(event)) || {}) as { id?: unknown; step?: unknown }
  const id = typeof b.id === 'string' ? b.id : ''
  const step = b.step === 'completed' ? 'completed' : 'settled'
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw createError({ statusCode: 404, statusMessage: 'Top-up not found' })
  const row = await getTopupRow(user.id, id)
  const ref = String(row?.webform_id || '')
  if (!row || !ref.startsWith('ow:')) throw createError({ statusCode: 404, statusMessage: 'Top-up not found' })
  await simulate(ref.slice(3), step)
  return { ok: true }
})
