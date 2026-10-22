import { rateLimit, requireUser } from '../../utils/auth'
import { circleSettings, isUuid } from '../../utils/circle'
import { runBridge, userNetworkWallets, usdcBalance } from '../../utils/crosschain'
import { checkBridgeAmount, checkRoute } from '../../utils/crosschainRules'
import { createBridgeTransfer, listBridgeTransfers } from '../../utils/db'

interface StartBody {
  from?: unknown
  to?: unknown
  amount?: unknown
  requestId?: unknown
}

// Starts moving USDC between two of the signed-in user's own wallets. The
// destination is always the user's own wallet on the other network.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  rateLimit(user.id, 'bridge-start', 5, 60_000)
  const settings = circleSettings()

  const body = (await readBody<StartBody>(event)) || {}
  const requestId = isUuid(body.requestId) ? body.requestId : ''
  if (!requestId) {
    throw createError({ statusCode: 400, statusMessage: 'Request id is required' })
  }

  const route = checkRoute(body.from, body.to, settings.live)
  if (!route.ok) {
    throw createError({ statusCode: 400, statusMessage: route.message })
  }
  const from = String(body.from)
  const to = String(body.to)

  const wallets = await userNetworkWallets(user.id)
  const source = wallets.find((w) => w.blockchain === from)
  const target = wallets.find((w) => w.blockchain === to)
  if (!source || !target) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Create your wallet on both networks first',
    })
  }

  // One bridge at a time per user, so funds are never moved twice by accident.
  const recent = await listBridgeTransfers(user.id, 5)
  const active = recent.find(
    (t) =>
      t.status === 'running' &&
      t.id !== requestId &&
      Date.now() - new Date(t.updated_at || t.created_at || 0).getTime() < 15 * 60_000,
  )
  if (active) {
    throw createError({
      statusCode: 409,
      statusMessage: 'A bridge is already in progress. Wait for it to finish',
    })
  }

  const balance = await usdcBalance(source.circleWalletId)
  const amount = checkBridgeAmount(body.amount, settings.maxSendUsdc, balance)
  if (!amount.ok) {
    throw createError({ statusCode: 400, statusMessage: amount.message })
  }

  const created = await createBridgeTransfer({
    id: requestId,
    user_id: user.id,
    from_chain: from,
    to_chain: to,
    amount: amount.amount!,
    status: 'running',
    steps: [],
  })
  // Same request id sent twice: do not start a second bridge.
  if (!created) {
    return { id: requestId, status: 'running', duplicate: true }
  }

  const job = runBridge({
    transferId: requestId,
    fromCircle: from,
    toCircle: to,
    fromAddress: source.address,
    toAddress: target.address,
    amount: amount.amount!,
  })
  if (typeof (event as any).waitUntil === 'function') {
    ;(event as any).waitUntil(job)
  } else {
    void job
  }
  return { id: requestId, status: 'running' }
})
