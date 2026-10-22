import { requireUser } from '../../utils/auth'
import { circleSettings } from '../../utils/circle'
import { networksFor } from '../../utils/crosschainRules'
import { userNetworkWallets, usdcBalance } from '../../utils/crosschain'

// Lists the networks the user can bridge between, which ones they already have a
// wallet on, and the USDC balance there.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const settings = circleSettings()
  const networks = networksFor(settings.live)
  const wallets = await userNetworkWallets(user.id)

  const rows = await Promise.all(
    networks.map(async (n) => {
      const w = wallets.find((x) => x.blockchain === n.circle)
      let balance: number | null = null
      if (w) {
        try {
          balance = await usdcBalance(w.circleWalletId)
        } catch {
          balance = null
        }
      }
      return {
        id: n.circle,
        label: n.label,
        address: w ? w.address : null,
        balance,
      }
    }),
  )

  return {
    networks: rows,
    maxUsdc: settings.maxSendUsdc,
    live: settings.live,
    sdkReady: Boolean(String(useRuntimeConfig().bridgeSdkInstalled || '')),
  }
})
