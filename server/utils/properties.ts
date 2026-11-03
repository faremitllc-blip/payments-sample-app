import {
  circleRequest,
  circleSettings,
  executeContract,
  getTransactionStatus,
  uuidFromSeed,
} from './circle'
import { userNetworkWallets, usdcBalance, type UserNetworkWallet } from './crosschain'
import { findNetwork } from './crosschainRules'
import {
  getInvestmentRow,
  getProperty,
  updateInvestmentRow,
  type PropertyInvestmentRow,
} from './db'
import { isSwitchOn } from './clean'
import { memoGet, memoSet } from './memo'
import {
  parsePosition,
  parseSummary,
  readInvestState,
  txOutcome,
  usdcToMicroString,
  type InvestState,
  type InvestTxPhase,
  type Position,
  type PropertySummary,
} from './propertiesRules'

export interface PoolSettings {
  address: string
  chain: string
  chainLabel: string
  usdc: string
  live: boolean
  maxInvestUsdc: number
}

/** Settings for the property pool contract, or an error if it is not switched on. */
export function poolSettings(): PoolSettings {
  const config = useRuntimeConfig()
  const circle = circleSettings()
  const address = String(config.propertyPoolAddress || '').trim()
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Property investing is not switched on yet',
    })
  }
  if (circle.live && !isSwitchOn(config.allowLiveProperties)) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Property investing is not switched on for live funds yet',
    })
  }
  const chainId = String(config.propertyPoolChain || 'MATIC').trim()
  const network = findNetwork(chainId, circle.live)
  if (!network) {
    throw createError({
      statusCode: 503,
      statusMessage: 'The property pool network is not supported',
    })
  }
  const max = Number(config.maxInvestUsdc)
  return {
    address,
    chain: network.circle,
    chainLabel: network.label,
    usdc: network.usdc,
    live: circle.live,
    maxInvestUsdc: max > 0 ? max : circle.maxSendUsdc,
  }
}

async function queryContract(
  pool: PoolSettings,
  signature: string,
  params: Array<string | number>,
): Promise<unknown[]> {
  const result = await circleRequest<{ data: { outputValues?: unknown[] } }>(
    '/v1/w3s/contracts/query',
    {
      method: 'POST',
      body: {
        address: pool.address,
        blockchain: pool.chain,
        abiFunctionSignature: signature,
        abiParameters: params,
      },
    },
  )
  return result.data.outputValues || []
}

/** The contract's view of a property. Reused for 10 seconds to keep screens quick. */
export async function readSummary(pool: PoolSettings, onchainId: number | string): Promise<PropertySummary> {
  const key = `prop-summary:${pool.address}:${onchainId}`
  const cached = memoGet<PropertySummary>(key)
  if (cached) return cached
  const parsed = parseSummary(await queryContract(pool, 'summary(uint256)', [String(onchainId)]))
  if (!parsed) {
    throw createError({ statusCode: 502, statusMessage: 'Could not read the property from the blockchain' })
  }
  memoSet(key, parsed, 10_000)
  return parsed
}

export async function readPosition(
  pool: PoolSettings,
  onchainId: number | string,
  address: string,
): Promise<Position> {
  const parsed = parsePosition(
    await queryContract(pool, 'position(uint256,address)', [String(onchainId), address]),
  )
  if (!parsed) {
    throw createError({ statusCode: 502, statusMessage: 'Could not read your position from the blockchain' })
  }
  return parsed
}

/** The user's wallet on the pool's network, if they have one. */
export async function poolWallet(userId: string, pool: PoolSettings): Promise<UserNetworkWallet | null> {
  const wallets = await userNetworkWallets(userId)
  return wallets.find((w) => w.blockchain === pool.chain) || null
}

export { usdcBalance }

function messageOf(err: any): string {
  const m = err?.statusMessage || err?.message
  return typeof m === 'string' && m ? m.slice(0, 300) : 'The step failed'
}

/**
 * Moves an investment forward by one small step and returns quickly. The page
 * calls it every few seconds. Each on-chain step has a fixed idempotency key, so
 * calling it twice can never send a transaction twice.
 */
export async function advanceInvestment(userId: string, investmentId: string): Promise<void> {
  const row = await getInvestmentRow(userId, investmentId)
  if (!row || row.status !== 'running') return
  const pool = poolSettings()
  const property = await getProperty(row.property_id)
  const wallet = await poolWallet(userId, pool)
  const state = readInvestState(row.state)

  const save = async (patch: { status?: string; error?: string | null } = {}) => {
    await updateInvestmentRow(row.id, {
      state: state as unknown,
      status: patch.status || row.status,
      ...(patch.error !== undefined ? { error: patch.error } : {}),
    })
  }
  const fail = async (phase: InvestTxPhase, error: string) => {
    state.failedPhase = phase
    await save({ status: 'failed', error })
  }

  const micro = usdcToMicroString(row.amount)
  if (!property || !wallet || !micro) {
    await save({ status: 'failed', error: 'This investment can no longer be completed' })
    return
  }

  const submit = async (phase: InvestTxPhase, contract: string, signature: string, params: string[]) => {
    try {
      const tx = await executeContract({
        walletId: wallet.circleWalletId,
        contractAddress: contract,
        signature,
        params,
        idempotencyKey: uuidFromSeed(`invest:${row.id}:${phase}:${state.attempts[phase]}`),
        refId: `invest:${row.id}:${phase}`,
      })
      state.tx[phase] = { id: tx.id }
      await save()
    } catch (err: any) {
      await fail(phase, messageOf(err))
    }
  }

  const confirmed = async (phase: InvestTxPhase): Promise<boolean> => {
    const ref = state.tx[phase]
    if (!ref) return false
    let status
    try {
      status = await getTransactionStatus(ref.id)
    } catch {
      return false
    }
    if (status.txHash) ref.hash = status.txHash
    const outcome = txOutcome(status.state)
    if (outcome === 'failed') {
      await fail(phase, `Circle reported ${status.state}${status.errorReason ? `: ${status.errorReason}` : ''}`)
      return false
    }
    if (outcome === 'done') return true
    await save()
    return false
  }

  if (state.phase === 'approve') {
    if (!state.tx.approve) {
      await submit('approve', pool.usdc, 'approve(address,uint256)', [pool.address, micro])
    } else if (await confirmed('approve')) {
      state.phase = 'invest'
      await save()
    }
    return
  }

  if (state.phase === 'invest') {
    if (!state.tx.invest) {
      // Check the property still takes money before sending anything.
      const summary = await readSummary(pool, property.onchain_id)
      const open = summary.status === 'open' && summary.deadline * 1000 > Date.now()
      const room = BigInt(summary.target) - BigInt(summary.raised) >= BigInt(micro)
      if (!open || !room) {
        state.failedPhase = 'invest'
        await save({
          status: 'failed',
          error: open
            ? 'Another investor filled the property first. Your USDC was not moved'
            : 'This property is no longer open for investment. Your USDC was not moved',
        })
        return
      }
      await submit('invest', pool.address, 'invest(uint256,uint256)', [String(property.onchain_id), micro])
    } else if (await confirmed('invest')) {
      state.phase = 'done'
      await save({ status: 'completed', error: null })
    }
  }
}
