// Pure rules for bridging USDC between networks with Circle's CCTP V2. No
// network calls here, so they are easy to test.
//
// Contract addresses, domain ids and USDC addresses come from Circle's
// documentation (developers.circle.com). Check them there before changing.

export const TOKEN_MESSENGER_V2 = '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d'
export const MESSAGE_TRANSMITTER_V2 = '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64'
export const IRIS_API = 'https://iris-api.circle.com'

/** "Standard" transfer: waits for the source chain to finalise, and costs no CCTP fee. */
export const FINALITY_STANDARD = 2000

export interface BridgeNetwork {
  /** Circle's blockchain id, used when creating wallets. */
  circle: string
  label: string
  /** CCTP domain id. */
  domain: number
  usdc: string
  explorerTx: string
}

export const BRIDGE_NETWORKS: BridgeNetwork[] = [
  {
    circle: 'ETH',
    label: 'Ethereum',
    domain: 0,
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    explorerTx: 'https://etherscan.io/tx/',
  },
  {
    circle: 'BASE',
    label: 'Base',
    domain: 6,
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    explorerTx: 'https://basescan.org/tx/',
  },
  {
    circle: 'MATIC',
    label: 'Polygon',
    domain: 7,
    usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    explorerTx: 'https://polygonscan.com/tx/',
  },
  {
    circle: 'ARB',
    label: 'Arbitrum',
    domain: 3,
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    explorerTx: 'https://arbiscan.io/tx/',
  },
  {
    circle: 'AVAX',
    label: 'Avalanche',
    domain: 1,
    usdc: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
    explorerTx: 'https://snowtrace.io/tx/',
  },
  {
    circle: 'OP',
    label: 'OP Mainnet',
    domain: 2,
    usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    explorerTx: 'https://optimistic.etherscan.io/tx/',
  },
]

/** Bridging uses real mainnets only. Test keys get an empty list. */
export function networksFor(live: boolean): BridgeNetwork[] {
  return live ? BRIDGE_NETWORKS : []
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

/** Left-pads a 20 byte address to the 32 byte form CCTP uses. */
export function addressToBytes32(address: string): string {
  const clean = address.toLowerCase().replace(/^0x/, '')
  if (!/^[0-9a-f]{40}$/.test(clean)) {
    throw new Error('Invalid address')
  }
  return `0x${'0'.repeat(24)}${clean}`
}

export const ZERO_BYTES32 = `0x${'0'.repeat(64)}`

/** Converts "5.25" to "5250000" (USDC has 6 decimals). Returns null if invalid. */
export function toMicro(amount: string): string | null {
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(amount.trim())
  if (!m) return null
  const micro = BigInt(m[1]) * BigInt(1_000_000) + BigInt((m[2] || '').padEnd(6, '0') || '0')
  return micro.toString()
}

// ---- The bridge as a small state machine, saved in the database ----

export type Phase = 'approve' | 'burn' | 'attest' | 'mint' | 'done'
export type TxPhase = 'approve' | 'burn' | 'mint'

export interface TxRef {
  id: string
  hash?: string
}

export interface BridgeState {
  phase: Phase
  attempts: { approve: number; burn: number; mint: number }
  tx: { approve?: TxRef; burn?: TxRef; mint?: TxRef }
  message?: string
  attestation?: string
  /** The phase that failed, so Retry knows where to resume. */
  failedPhase?: TxPhase
}

export function newState(): BridgeState {
  return { phase: 'approve', attempts: { approve: 1, burn: 1, mint: 1 }, tx: {} }
}

export function readState(raw: unknown): BridgeState {
  const base = newState()
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Partial<BridgeState>
  const phases: Phase[] = ['approve', 'burn', 'attest', 'mint', 'done']
  return {
    phase: phases.includes(r.phase as Phase) ? (r.phase as Phase) : 'approve',
    attempts: { ...base.attempts, ...(r.attempts || {}) },
    tx: { ...(r.tx || {}) },
    message: typeof r.message === 'string' ? r.message : undefined,
    attestation: typeof r.attestation === 'string' ? r.attestation : undefined,
    failedPhase: r.failedPhase,
  }
}

const GOOD = ['CONFIRMED', 'COMPLETE']
const BAD = ['FAILED', 'DENIED', 'CANCELLED']

export function txOutcome(state: string): 'done' | 'failed' | 'waiting' {
  if (GOOD.includes(state)) return 'done'
  if (BAD.includes(state)) return 'failed'
  return 'waiting'
}

/** Resets the failed step so it can be sent again with a fresh idempotency key. */
export function prepareRetry(state: BridgeState): BridgeState | null {
  const phase = state.failedPhase
  if (!phase) return null
  const next = readState(JSON.parse(JSON.stringify(state)))
  delete next.tx[phase]
  next.attempts[phase] += 1
  next.phase = phase
  next.failedPhase = undefined
  return next
}

export interface BridgeStepView {
  name: string
  state: 'waiting' | 'running' | 'done' | 'failed'
  explorerUrl?: string
}

/** Builds the list of steps the page shows from the saved state. */
export function stepsView(
  state: BridgeState,
  from: BridgeNetwork | null,
  to: BridgeNetwork | null,
): BridgeStepView[] {
  const order: Phase[] = ['approve', 'burn', 'attest', 'mint']
  const idx = state.phase === 'done' ? 4 : order.indexOf(state.phase)
  const link = (n: BridgeNetwork | null, ref?: TxRef) =>
    n && ref?.hash ? `${n.explorerTx}${ref.hash}` : undefined
  const names: Record<string, string> = {
    approve: `Approve USDC on ${from?.label || 'source'}`,
    burn: `Burn USDC on ${from?.label || 'source'}`,
    attest: 'Wait for Circle to confirm',
    mint: `Mint USDC on ${to?.label || 'destination'}`,
  }
  return order.map((p, i) => {
    let st: BridgeStepView['state'] = i < idx ? 'done' : i === idx ? 'running' : 'waiting'
    if (state.failedPhase === p) st = 'failed'
    return {
      name: names[p],
      state: st,
      explorerUrl:
        p === 'approve'
          ? link(from, state.tx.approve)
          : p === 'burn'
            ? link(from, state.tx.burn)
            : p === 'mint'
              ? link(to, state.tx.mint)
              : undefined,
    }
  })
}
