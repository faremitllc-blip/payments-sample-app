import { requireUser } from '../../utils/auth'
import { circleSettings } from '../../utils/circle'
import { findNetwork, readState, stepsView } from '../../utils/crosschainRules'
import { listBridgeTransfers } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const live = circleSettings().live
  const rows = await listBridgeTransfers(user.id, 20)
  return {
    transfers: rows.map((t) => ({
      id: t.id,
      from: t.from_chain,
      to: t.to_chain,
      amount: t.amount,
      status: t.status,
      steps: stepsView(
        readState(t.result),
        findNetwork(t.from_chain, live),
        findNetwork(t.to_chain, live),
      ),
      error: t.error || null,
      createdAt: t.created_at,
    })),
  }
})
