// Pure rules for the pooled property investments. No network calls here.
import { txOutcome } from './crosschainRules'

export { txOutcome }

export type OnchainStatus = 'none' | 'open' | 'funded' | 'failed' | 'closed'
const STATUS_NAMES: OnchainStatus[] = ['none', 'open', 'funded', 'failed', 'closed']

export interface PropertySummary {
  status: OnchainStatus
  /** Amounts are USDC micro-units (6 decimals) as strings. */
  target: string
  raised: string
  deadline: number
  released: boolean
  distributed: string
}

/** Turns the values the contract's summary() returned into a clean object. */
export function parseSummary(values: unknown): PropertySummary | null {
  if (!Array.isArray(values) || values.length < 6) return null
  const num = (v: unknown) => (/^\d+$/.test(String(v)) ? String(v) : null)
  const status = Number(values[0])
  const target = num(values[1])
  const raised = num(values[2])
  const deadline = Number(values[3])
  const distributed = num(values[5])
  if (!Number.isInteger(status) || status < 0 || status > 4) return null
  if (target === null || raised === null || distributed === null || !Number.isFinite(deadline)) {
    return null
  }
  const released = values[4] === true || String(values[4]).toLowerCase() === 'true'
  return { status: STATUS_NAMES[status], target, raised, deadline, released, distributed }
}

export interface Position {
  invested: string
  claimable: string
  claimed: string
}

export function parsePosition(values: unknown): Position | null {
  if (!Array.isArray(values) || values.length < 3) return null
  const ok = values.slice(0, 3).every((v) => /^\d+$/.test(String(v)))
  if (!ok) return null
  return {
    invested: String(values[0]),
    claimable: String(values[1]),
    claimed: String(values[2]),
  }
}

/** 5250000 -> "5.25" */
export function microToUsdc(micro: string | bigint): string {
  const n = BigInt(micro)
  const whole = n / BigInt(1_000_000)
  const frac = (n % BigInt(1_000_000)).toString().padStart(6, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : `${whole}`
}

export function usdcToMicroString(text: string): string | null {
  const m = /^(\d{1,9})(?:\.(\d{1,6}))?$/.exec(text.trim())
  if (!m) return null
  return (BigInt(m[1]) * BigInt(1_000_000) + BigInt((m[2] || '').padEnd(6, '0') || '0')).toString()
}

export interface InvestCheck {
  ok: boolean
  message?: string
  amount?: string
  micro?: string
}

/**
 * Checks an investment amount against the property's minimum, the per-investment
 * cap, what is still open for funding and the user's wallet balance.
 */
export function checkInvestAmount(input: {
  raw: unknown
  minUsdc: number
  maxUsdc: number
  remainingMicro: string
  balanceUsdc: number
}): InvestCheck {
  const text = typeof input.raw === 'string' ? input.raw.trim() : ''
  const micro = usdcToMicroString(text)
  if (!micro) return { ok: false, message: 'Enter an amount like 100 or 100.50' }
  const value = Number(text)
  if (!(value > 0)) return { ok: false, message: 'The amount must be more than zero' }
  if (value < input.minUsdc) {
    return { ok: false, message: `The smallest investment in this property is ${input.minUsdc} USDC` }
  }
  if (value > input.maxUsdc) {
    return { ok: false, message: `The most you can invest at once is ${input.maxUsdc} USDC` }
  }
  if (BigInt(micro) > BigInt(input.remainingMicro)) {
    return {
      ok: false,
      message: `Only ${microToUsdc(input.remainingMicro)} USDC is still open in this property`,
    }
  }
  if (value > input.balanceUsdc) {
    return { ok: false, message: 'That is more than the USDC in your wallet on this network' }
  }
  return { ok: true, amount: text, micro }
}

export function isAdminEmail(list: unknown, email: string): boolean {
  const wanted = email.trim().toLowerCase()
  if (!wanted) return false
  return String(list || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(wanted)
}

// ---- An investment is two on-chain steps, saved so it can be resumed ----

export type InvestPhase = 'approve' | 'invest' | 'done'
export type InvestTxPhase = 'approve' | 'invest'

export interface InvestState {
  phase: InvestPhase
  attempts: { approve: number; invest: number }
  tx: { approve?: { id: string; hash?: string }; invest?: { id: string; hash?: string } }
  failedPhase?: InvestTxPhase
}

export function newInvestState(): InvestState {
  return { phase: 'approve', attempts: { approve: 1, invest: 1 }, tx: {} }
}

export function readInvestState(raw: unknown): InvestState {
  const base = newInvestState()
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Partial<InvestState>
  const phases: InvestPhase[] = ['approve', 'invest', 'done']
  return {
    phase: phases.includes(r.phase as InvestPhase) ? (r.phase as InvestPhase) : 'approve',
    attempts: { ...base.attempts, ...(r.attempts || {}) },
    tx: { ...(r.tx || {}) },
    failedPhase: r.failedPhase === 'approve' || r.failedPhase === 'invest' ? r.failedPhase : undefined,
  }
}

export function prepareInvestRetry(state: InvestState): InvestState | null {
  const phase = state.failedPhase
  if (!phase) return null
  const next = readInvestState(JSON.parse(JSON.stringify(state)))
  delete next.tx[phase]
  next.attempts[phase] += 1
  next.phase = phase
  next.failedPhase = undefined
  return next
}

export interface InvestStepView {
  name: string
  state: 'waiting' | 'running' | 'done' | 'failed'
}

export function investSteps(state: InvestState): InvestStepView[] {
  const order: InvestPhase[] = ['approve', 'invest']
  const idx = state.phase === 'done' ? 2 : order.indexOf(state.phase)
  const names = { approve: 'Allow the pool to use your USDC', invest: 'Put your USDC into the property' }
  return order.map((p, i) => {
    let st: InvestStepView['state'] = i < idx ? 'done' : i === idx ? 'running' : 'waiting'
    if (state.failedPhase === p) st = 'failed'
    return { name: names[p as 'approve' | 'invest'], state: st }
  })
}
