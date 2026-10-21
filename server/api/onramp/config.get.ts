import { requireUser } from '../../utils/auth'
import { getWalletRow } from '../../utils/db'
import { ONRAMP_MESSAGES, onrampBlock, onrampSettings } from '../../utils/onramp'

// What the Buy page needs to know: whether buying works for this user, and if
// not, why. No key or secret is ever included.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const settings = onrampSettings()
  const wallet = settings.configured ? await getWalletRow(user.id) : null
  const block = onrampBlock(settings, wallet)
  return {
    ready: block === '',
    reason: block,
    message: block ? ONRAMP_MESSAGES[block] : '',
    sandbox: settings.sandbox,
    widgetBaseUrl: settings.widgetBaseUrl,
    network: wallet ? wallet.blockchain : '',
  }
})
