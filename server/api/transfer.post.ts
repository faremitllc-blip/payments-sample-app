import { rateLimit, requireUser } from '../utils/auth'
import { isUuid, sendUsdc } from '../utils/circle'
import { userNetworkWallets } from '../utils/crosschain'
import { getWalletRow } from '../utils/db'

interface TransferBody {
  to?: unknown
  amount?: unknown
  requestId?: unknown
  /** Circle blockchain id of the wallet to send from, e.g. MATIC or BASE. */
  from?: unknown
}

// Sends USDC from the signed-in user's own wallet. The wallet is looked up from
// the verified user, never from anything the browser sends.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  rateLimit(user.id, 'transfer', 10, 60_000)

  const body = (await readBody<TransferBody>(event)) || {}
  const to = typeof body.to === 'string' ? body.to.trim() : ''
  const amount = typeof body.amount === 'string' ? body.amount.trim() : ''
  const requestId = isUuid(body.requestId) ? body.requestId : ''

  if (!to || !amount || !requestId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Recipient, amount and request id are required',
    })
  }

  const main = await getWalletRow(user.id)
  if (!main) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Create your wallet first',
    })
  }

  // The wallet to send from must be one of this user's own wallets. Without a
  // choice, the main wallet is used.
  let wallet = main
  const from = typeof body.from === 'string' ? body.from.trim() : ''
  if (from && from !== main.blockchain) {
    const chosen = (await userNetworkWallets(user.id)).find((w) => w.blockchain === from)
    if (!chosen) {
      throw createError({
        statusCode: 400,
        statusMessage: 'You do not have a wallet on that network',
      })
    }
    wallet = {
      user_id: user.id,
      circle_wallet_id: chosen.circleWalletId,
      address: chosen.address,
      blockchain: chosen.blockchain,
    }
  }

  const transfer = await sendUsdc(wallet, to, amount, requestId)
  return { id: transfer.id, state: transfer.state }
})
