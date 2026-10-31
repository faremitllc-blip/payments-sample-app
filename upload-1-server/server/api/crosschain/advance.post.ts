import { rateLimit, requireUser } from '../../utils/auth'
import { isUuid } from '../../utils/circle'
import { advanceBridge } from '../../utils/crosschain'

// Moves a running bridge forward by one step. The Bridge page calls this every
// few seconds while a bridge is in progress.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  rateLimit(user.id, 'bridge-advance', 40, 60_000)
  const body = (await readBody<{ id?: unknown }>(event)) || {}
  if (!isUuid(body.id)) {
    throw createError({ statusCode: 400, statusMessage: 'Transfer id is required' })
  }
  await advanceBridge(user.id, body.id)
  return { ok: true }
})
