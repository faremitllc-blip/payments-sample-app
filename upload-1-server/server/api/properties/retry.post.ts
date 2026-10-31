import { rateLimit, requireUser } from '../../utils/auth'
import { isUuid } from '../../utils/circle'
import { getInvestmentRow, updateInvestmentRow } from '../../utils/db'
import { prepareInvestRetry, readInvestState } from '../../utils/propertiesRules'
import { advanceInvestment } from '../../utils/properties'

// Tries the step that failed again. A step that already finished is not repeated.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  rateLimit(user.id, 'invest-retry', 5, 60_000)
  const body = (await readBody<{ id?: unknown }>(event)) || {}
  const id = isUuid(body.id) ? body.id : ''
  const row = id ? await getInvestmentRow(user.id, id) : null
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Investment not found' })
  }
  if (row.status !== 'failed') {
    throw createError({ statusCode: 409, statusMessage: 'This investment does not need a retry' })
  }
  const next = prepareInvestRetry(readInvestState(row.state))
  if (!next) {
    throw createError({ statusCode: 409, statusMessage: 'This investment cannot be retried. Start a new one instead' })
  }
  await updateInvestmentRow(id, { status: 'running', error: null, state: next as unknown })
  await advanceInvestment(user.id, id)
  return { id, status: 'running' }
})
