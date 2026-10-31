import { rateLimit, requireUser } from '../../utils/auth'
import { circleSettings, createWalletOnNetwork } from '../../utils/circle'
import { findNetwork } from '../../utils/crosschainRules'
import { userNetworkWallets } from '../../utils/crosschain'

// Creates the user's wallet on one more network. Calling it again returns the same wallet.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  rateLimit(user.id, 'network-wallet', 6, 60_000)
  const body = (await readBody<{ blockchain?: unknown }>(event)) || {}
  const network = findNetwork(body.blockchain, circleSettings().live)
  if (!network) {
    throw createError({ statusCode: 400, statusMessage: 'Choose a supported network' })
  }
  const existing = (await userNetworkWallets(user.id)).find(
    (w) => w.blockchain === network.circle,
  )
  if (existing) {
    return { wallet: { blockchain: existing.blockchain, address: existing.address } }
  }
  const row = await createWalletOnNetwork(user.id, network.circle)
  return { wallet: { blockchain: row.blockchain, address: row.address } }
})
