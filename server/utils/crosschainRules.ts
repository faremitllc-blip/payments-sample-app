// Pure rules for bridging USDC between networks. No network calls here, so they
// are easy to test.

export interface BridgeNetwork {
  /** Circle's blockchain id, used when creating wallets. */
  circle: string
  /** The chain name the App Kit expects. */
  kit: string
  /** Name shown to the user. */
  label: string
  testnet: boolean
}

export const BRIDGE_NETWORKS: BridgeNetwork[] = [
  { circle: 'ETH-SEPOLIA', kit: 'Ethereum_Sepolia', label: 'Ethereum Sepolia', testnet: true },
  { circle: 'BASE-SEPOLIA', kit: 'Base_Sepolia', label: 'Base Sepolia', testnet: true },
  { circle: 'MATIC-AMOY', kit: 'Polygon_Amoy_Testnet', label: 'Polygon Amoy', testnet: true },
  { circle: 'ARB-SEPOLIA', kit: 'Arbitrum_Sepolia', label: 'Arbitrum Sepolia', testnet: true },
  { circle: 'AVAX-FUJI', kit: 'Avalanche_Fuji', label: 'Avalanche Fuji', testnet: true },
  { circle: 'OP-SEPOLIA', kit: 'Optimism_Sepolia', label: 'OP Sepolia', testnet: true },
  { circle: 'ARC-TESTNET', kit: 'Arc_Testnet', label: 'Arc Testnet', testnet: true },
  { circle: 'ETH', kit: 'Ethereum', label: 'Ethereum', testnet: false },
  { circle: 'BASE', kit: 'Base', label: 'Base', testnet: false },
  { circle: 'MATIC', kit: 'Polygon', label: 'Polygon', testnet: false },
  { circle: 'ARB', kit: 'Arbitrum', label: 'Arbitrum', testnet: false },
  { circle: 'AVAX', kit: 'Avalanche', label: 'Avalanche', testnet: false },
  { circle: 'OP', kit: 'Optimism', label: 'OP Mainnet', testnet: false },
]

/** Networks the user may use: testnets for test keys, mainnets for live keys. */
export function networksFor(live: boolean): BridgeNetwork[] {
  return BRIDGE_NETWORKS.filter((n) => n.testnet === !live)
}

export function findNetwork(circleId: unknown, live: boolean): BridgeNetwork | null {
  if (typeof circleId !== 'string') return null
  return networksFor(live).find((n) => n.circle === circleId) || null
}

export interface BridgeCheck {
  ok: boolean
  message?: string
  /** Cleaned amount, e.g. "5.25". */
  amount?: string
}

/** Validates the amount text: positive, at most 6 decimals, within the cap and balance. */
export function checkBridgeAmount(
  raw: unknown,
  maxUsdc: number,
  balanceUsdc: number,
): BridgeCheck {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (!/^\d{1,9}(\.\d{1,6})?$/.test(text)) {
    return { ok: false, message: 'Enter an amount like 5 or 5.25' }
  }
  const value = Number(text)
  if (!(value > 0)) {
    return { ok: false, message: 'The amount must be more than zero' }
  }
  if (value < 1) {
    return { ok: false, message: 'The smallest amount you can bridge is 1 USDC' }
  }
  if (value > maxUsdc) {
    return { ok: false, message: `The most you can bridge at once is ${maxUsdc} USDC` }
  }
  if (value > balanceUsdc) {
    return { ok: false, message: 'That is more than the USDC in the source wallet' }
  }
  return { ok: true, amount: text }
}

export function checkRoute(from: unknown, to: unknown, live: boolean): BridgeCheck {
  const a = findNetwork(from, live)
  const b = findNetwork(to, live)
  if (!a || !b) return { ok: false, message: 'Choose two supported networks' }
  if (a.circle === b.circle) {
    return { ok: false, message: 'Pick two different networks' }
  }
  return { ok: true }
}

export interface BridgeStepView {
  name: string
  state: string
  txHash?: string
  explorerUrl?: string
  errorMessage?: string
}

/** Turns whatever the kit returned into a small, safe list for the browser. */
export function cleanSteps(steps: unknown): BridgeStepView[] {
  if (!Array.isArray(steps)) return []
  return steps.slice(0, 12).map((s: any) => ({
    name: String(s?.name || 'step').slice(0, 60),
    state: String(s?.state || 'pending').slice(0, 20),
    ...(typeof s?.txHash === 'string' ? { txHash: s.txHash } : {}),
    ...(typeof s?.explorerUrl === 'string' && /^https:\/\//.test(s.explorerUrl)
      ? { explorerUrl: s.explorerUrl }
      : {}),
    ...(s?.errorMessage ? { errorMessage: String(s.errorMessage).slice(0, 200) } : {}),
  }))
}
