import { rateLimit, requireUser } from '../../utils/auth'
import { isUuid } from '../../utils/circle'
import { advanceInvestment } from '../../utils/properties'

// Moves a running investment forward by one step. The page calls this every few seconds.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  rateLimit(user.id, 'invest-advance', 40, 60_000)
  const body = (await readBody<{ id?: unknown }>(event)) || {}
  if (!isUuid(body.id)) {
    throw createError({ statusCode: 400, statusMessage: 'Investment id is required' })
  }
  await advanceInvestment(user.id, body.id)
  return { ok: true }
})
