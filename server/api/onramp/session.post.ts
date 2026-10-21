import { rateLimit, requireUser } from '../../utils/auth'
import { getWalletRow } from '../../utils/db'
import { ONRAMP_MESSAGES, onrampBlock, onrampSettings } from '../../utils/onramp'

// Starts a "buy USDC with fiat" session. The money is always delivered to the
// signed-in user's own wallet, looked up here from the verified user. Nothing
// about the destination is ever taken from the browser.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  rateLimit(user.id, 'onramp-session', 6, 60_000)

  const settings = onrampSettings()
  const wallet = settings.configured ? await getWalletRow(user.id) : null
  const block = onrampBlock(settings, wallet)
  if (block || !wallet) {
    throw createError({
      statusCode: block === 'not_configured' ? 503 : 409,
      statusMessage: block ? ONRAMP_MESSAGES[block] : ONRAMP_MESSAGES.no_wallet,
    })
  }

  try {
    const { createAppServerKit } = await import('@circle-fin/app-kit/server')
    const server = createAppServerKit({
      onramp: {
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        widgetBaseUrl: settings.widgetBaseUrl,
        // Needed for debit card, Apple Pay and Google Pay in production.
        ...(settings.referrerDomain ? { referrerDomain: settings.referrerDomain } : {}),
      },
    } as any)

    const session = await (server as any).onramp.createSession({
      appUserId: user.id,
      destinationAddress: wallet.address,
      assets: { tokens: ['USDC'], chains: ['arc'] },
    })

    setResponseHeader(event, 'Cache-Control', 'no-store')
    return session
  } catch (error: any) {
    // Show a plain message. The details can contain account information, so
    // they only go to the server log.
    console.error('Onramp session failed:', error?.type || '', error?.message || error)
    const status =
      error?.type === 'INPUT' ? 400 : error?.type === 'RATE_LIMIT' ? 429 : 502
    throw createError({
      statusCode: status,
      statusMessage:
        status === 429
          ? 'Too many attempts. Please wait a moment and try again'
          : status === 400
            ? 'The purchase could not be started with these details'
            : 'The buying service could not be reached. Please try again shortly',
    })
  }
})
