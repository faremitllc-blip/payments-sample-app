import { cleanCredential, isSwitchOn } from './clean'
import type { WalletRow } from './db'

/**
 * Settings for buying USDC with fiat through the Arc App Kit on-ramp
 * (docs.arc.io/app-kit/onramp). The API key stays on the server.
 *
 * The on-ramp pays out USDC on Arc only, so it can only be used with a wallet
 * that lives on Arc. Anything else is refused here, before a session is made.
 */
export interface OnrampSettings {
  configured: boolean
  sandbox: boolean
  apiKey: string
  referrerDomain: string
  widgetBaseUrl: string
  baseUrl: string
}

export function onrampSettings(): OnrampSettings {
  const config = useRuntimeConfig()
  const apiKey = cleanCredential(config.onrampApiKey)
  const sandbox = String(config.onrampEnv || 'sandbox').trim().toLowerCase() !== 'production'
  // A bare host name: no https://, no port, no path.
  const referrerDomain = String(config.onrampReferrerDomain || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/[:/].*$/, '')
  return {
    configured: apiKey.length > 0,
    sandbox,
    apiKey,
    referrerDomain,
    widgetBaseUrl: sandbox ? 'https://onramp-sandbox.arc.io' : 'https://onramp.arc.io',
    baseUrl: sandbox ? 'https://api-test.circle.com' : 'https://api.circle.com',
  }
}

/** True for Circle's Arc identifiers: ARC and ARC-TESTNET. */
export function isArcBlockchain(blockchain: string): boolean {
  return /^ARC(-|$)/i.test(String(blockchain || '').trim())
}

export type OnrampBlock =
  | ''
  | 'not_configured'
  | 'live_not_allowed'
  | 'no_wallet'
  | 'wrong_network'

/** Why buying is not possible right now, or '' when it is. */
export function onrampBlock(
  settings: OnrampSettings,
  wallet: Pick<WalletRow, 'blockchain'> | null,
): OnrampBlock {
  if (!settings.configured) {
    return 'not_configured'
  }
  if (!settings.sandbox) {
    const config = useRuntimeConfig()
    if (!isSwitchOn(config.allowLiveFunds)) {
      return 'live_not_allowed'
    }
  }
  if (!wallet) {
    return 'no_wallet'
  }
  if (!isArcBlockchain(wallet.blockchain)) {
    return 'wrong_network'
  }
  return ''
}

export const ONRAMP_MESSAGES: Record<Exclude<OnrampBlock, ''>, string> = {
  not_configured: 'Buying USDC is not switched on yet.',
  live_not_allowed:
    'Live buying is disabled. The site owner must allow live funds first.',
  no_wallet: 'Create your wallet first, then come back to buy USDC.',
  wrong_network:
    'Buying USDC delivers to the Arc network, and your wallet is on a different network. To keep your money safe, buying is switched off for this wallet.',
}
