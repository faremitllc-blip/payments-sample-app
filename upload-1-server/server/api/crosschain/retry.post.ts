import { rateLimit, requireUser } from '../../utils/auth'
import { isUuid } from '../../utils/circle'
import { advanceBridge } from '../../utils/crosschain'
import { prepareRetry, readState } from '../../utils/crosschainRules'
import { getBridgeTransfer, getBridgeTransferResult, updateBridgeTransfer } from '../../utils/db'

// Tries the step that failed again. Steps that already finished are not repeated.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  rateLimit(user.id, 'bridge-retry', 5, 60_000)
  const body = (await readBody<{ id?: unknown }>(event)) || {}
  const id = isUuid(body.id) ? body.id : ''
  const transfer = id ? await getBridgeTransfer(user.id, id) : null
  if (!transfer) {
    throw createError({ statusCode: 404, statusMessage: 'Transfer not found' })
  }
  if (transfer.status !== 'failed') {
    throw createError({ statusCode: 409, statusMessage: 'This transfer does not need a retry' })
  }
  const next = prepareRetry(readState(await getBridgeTransferResult(user.id, id)))
  if (!next) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This transfer cannot be retried. Start a new bridge instead',
    })
  }
  await updateBridgeTransfer(id, { status: 'running', error: null, result: next as unknown })
  await advanceBridge(user.id, id)
  return { id, status: 'running' }
})
