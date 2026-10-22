import { rateLimit, requireUser } from '../../utils/auth'
import { circleSettings, isUuid } from '../../utils/circle'
import { runBridge, userNetworkWallets } from '../../utils/crosschain'
import {
  getBridgeTransfer,
  getBridgeTransferResult,
  updateBridgeTransfer,
} from '../../utils/db'

// Continues a bridge that failed or stalled, from the step where it stopped.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  rateLimit(user.id, 'bridge-retry', 5, 60_000)
  circleSettings()
  const body = (await readBody<{ id?: unknown }>(event)) || {}
  const id = isUuid(body.id) ? body.id : ''
  const transfer = id ? await getBridgeTransfer(user.id, id) : null
  if (!transfer) {
    throw createError({ statusCode: 404, statusMessage: 'Transfer not found' })
  }
  const stale =
    Date.now() - new Date(transfer.updated_at || transfer.created_at || 0).getTime() >
    5 * 60_000
  if (transfer.status === 'completed' || (transfer.status === 'running' && !stale)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This transfer does not need a retry',
    })
  }

  const wallets = await userNetworkWallets(user.id)
  const source = wallets.find((w) => w.blockchain === transfer.from_chain)
  const target = wallets.find((w) => w.blockchain === transfer.to_chain)
  if (!source || !target) {
    throw createError({ statusCode: 400, statusMessage: 'Wallets for this transfer are missing' })
  }

  // Only transfers that saved a kit result can resume mid-way. Others would start
  // over, which could move funds twice, so they are refused.
  const resumable = (await getBridgeTransferResult(user.id, id)) as unknown
  if (!resumable || typeof resumable !== 'object' || !('steps' in (resumable as object))) {
    throw createError({
      statusCode: 409,
      statusMessage:
        'This transfer cannot be resumed automatically. Check the source wallet balance before trying again',
    })
  }

  await updateBridgeTransfer(id, { status: 'running', error: null })
  const job = runBridge({
    transferId: id,
    fromCircle: transfer.from_chain,
    toCircle: transfer.to_chain,
    fromAddress: source.address,
    toAddress: target.address,
    amount: transfer.amount,
    retry: resumable,
  })
  if (typeof (event as any).waitUntil === 'function') {
    ;(event as any).waitUntil(job)
  } else {
    void job
  }
  return { id, status: 'running' }
})
