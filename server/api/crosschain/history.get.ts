import { requireUser } from '../../utils/auth'
import { cleanSteps } from '../../utils/crosschainRules'
import { listBridgeTransfers } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const rows = await listBridgeTransfers(user.id, 20)
  return {
    transfers: rows.map((t) => ({
      id: t.id,
      from: t.from_chain,
      to: t.to_chain,
      amount: t.amount,
      // A bridge that has been "running" for a long time was cut off by the host.
      status:
        t.status === 'running' &&
        Date.now() - new Date(t.updated_at || t.created_at || 0).getTime() > 5 * 60_000
          ? 'stalled'
          : t.status,
      steps: cleanSteps(t.steps),
      error: t.error || null,
      createdAt: t.created_at,
    })),
  }
})
