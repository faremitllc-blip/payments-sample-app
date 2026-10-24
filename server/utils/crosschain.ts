import {
  executeContract,
  getBalances,
  getTransactionStatus,
  isUsdc,
  uuidFromSeed,
  circleSettings,
} from './circle'
import {
  addressToBytes32,
  FINALITY_STANDARD,
  findNetwork,
  IRIS_API,
  MESSAGE_TRANSMITTER_V2,
  readState,
  toMicro,
  TOKEN_MESSENGER_V2,
  txOutcome,
  ZERO_BYTES32,
  type BridgeState,
  type TxPhase,
} from './crosschainRules'
import {
  getBridgeTransfer,
  getWalletRow,
  listNetworkWallets,
  updateBridgeTransfer,
  type BridgeTransferRow,
} from './db'

export interface UserNetworkWallet {
  blockchain: string
  circleWalletId: string
  address: string
}

/** All the wallets the user has, one per network, including the main one. */
export async function userNetworkWallets(userId: string): Promise<UserNetworkWallet[]> {
  const [main, extra] = await Promise.all([getWalletRow(userId), listNetworkWallets(userId)])
  const list: UserNetworkWallet[] = []
  if (main) {
    list.push({
      blockchain: main.blockchain,
      circleWalletId: main.circle_wallet_id,
      address: main.address,
    })
  }
  for (const w of extra) {
    if (!list.some((x) => x.blockchain === w.blockchain)) {
      list.push({
        blockchain: w.blockchain,
        circleWalletId: w.circle_wallet_id,
        address: w.address,
      })
    }
  }
  return list
}

export async function usdcBalance(circleWalletId: string): Promise<number> {
  const balances = await getBalances(circleWalletId)
  const usdc = balances.find((b) => isUsdc(b))
  const value = Number(usdc?.amount || 0)
  return Number.isFinite(value) ? value : 0
}

async function save(row: BridgeTransferRow, state: BridgeState, patch: {
  status?: string
  error?: string | null
} = {}) {
  await updateBridgeTransfer(row.id, {
    status: patch.status || row.status,
    result: state as unknown,
    ...(patch.error !== undefined ? { error: patch.error } : {}),
  })
}

function messageOf(err: any): string {
  const m = err?.statusMessage || err?.message
  return typeof m === 'string' && m ? m.slice(0, 300) : 'The step failed'
}

/**
 * Moves a bridge forward by one small step and returns quickly. The page calls
 * this every few seconds. Every on-chain step uses a fixed idempotency key, so
 * calling it twice at the same time can never send a transaction twice.
 */
export async function advanceBridge(userId: string, transferId: string): Promise<void> {
  const row = await getBridgeTransfer(userId, transferId)
  if (!row || row.status !== 'running') return

  const live = circleSettings().live
  const from = findNetwork(row.from_chain, live)
  const to = findNetwork(row.to_chain, live)
  const wallets = await userNetworkWallets(userId)
  const source = wallets.find((w) => w.blockchain === row.from_chain)
  const target = wallets.find((w) => w.blockchain === row.to_chain)
  const state = readState(row.result)

  if (!from || !to || !source || !target) {
    await save(row, state, { status: 'failed', error: 'The wallets for this bridge are missing' })
    return
  }

  const fail = async (phase: TxPhase, error: string) => {
    state.failedPhase = phase
    await save(row, state, { status: 'failed', error })
  }

  // Sends a contract call once and remembers its Circle id.
  const submit = async (
    phase: TxPhase,
    walletId: string,
    contract: string,
    signature: string,
    params: Array<string | number>,
  ): Promise<void> => {
    try {
      const tx = await executeContract({
        walletId,
        contractAddress: contract,
        signature,
        params,
        idempotencyKey: uuidFromSeed(`bridge:${row.id}:${phase}:${state.attempts[phase]}`),
        refId: `bridge:${row.id}:${phase}`,
      })
      state.tx[phase] = { id: tx.id }
      await save(row, state)
    } catch (err: any) {
      await fail(phase, messageOf(err))
    }
  }

  // Checks a sent transaction. Returns true once it is confirmed on chain.
  const confirmed = async (phase: TxPhase): Promise<boolean> => {
    const ref = state.tx[phase]
    if (!ref) return false
    let status
    try {
      status = await getTransactionStatus(ref.id)
    } catch {
      return false // Try again on the next poll.
    }
    if (status.txHash) ref.hash = status.txHash
    const outcome = txOutcome(status.state)
    if (outcome === 'failed') {
      await fail(
        phase,
        `Circle reported ${status.state}${status.errorReason ? `: ${status.errorReason}` : ''}`,
      )
      return false
    }
    if (outcome === 'done') {
      return true
    }
    await save(row, state)
    return false
  }

  const micro = toMicro(row.amount)
  if (!micro) {
    await save(row, state, { status: 'failed', error: 'Invalid amount' })
    return
  }

  if (state.phase === 'approve') {
    if (!state.tx.approve) {
      await submit('approve', source.circleWalletId, from.usdc, 'approve(address,uint256)', [
        TOKEN_MESSENGER_V2,
        micro,
      ])
    } else if (await confirmed('approve')) {
      state.phase = 'burn'
      await save(row, state)
    }
    return
  }

  if (state.phase === 'burn') {
    if (!state.tx.burn) {
      // Standard transfer: no CCTP fee, so maxFee is 0.
      await submit(
        'burn',
        source.circleWalletId,
        TOKEN_MESSENGER_V2,
        'depositForBurn(uint256,uint32,bytes32,address,bytes32,uint256,uint32)',
        [
          micro,
          to.domain,
          addressToBytes32(target.address),
          from.usdc,
          ZERO_BYTES32,
          '0',
          FINALITY_STANDARD,
        ],
      )
    } else if (await confirmed('burn')) {
      if (!state.tx.burn?.hash) {
        // Confirmed but no hash yet: look again on the next poll.
        await save(row, state)
        return
      }
      state.phase = 'attest'
      await save(row, state)
    }
    return
  }

  if (state.phase === 'attest') {
    const hash = state.tx.burn?.hash
    if (!hash) {
      await fail('burn', 'The burn transaction hash is missing')
      return
    }
    try {
      const res: any = await $fetch(
        `${IRIS_API}/v2/messages/${from.domain}?transactionHash=${encodeURIComponent(hash)}`,
      )
      const m = Array.isArray(res?.messages) ? res.messages[0] : null
      if (
        m &&
        m.status === 'complete' &&
        typeof m.message === 'string' &&
        m.message.startsWith('0x') &&
        m.message.length > 2 &&
        typeof m.attestation === 'string' &&
        m.attestation.startsWith('0x')
      ) {
        state.message = m.message
        state.attestation = m.attestation
        state.phase = 'mint'
        await save(row, state)
      }
    } catch {
      // Circle returns "not found" until the burn is seen. Keep waiting.
    }
    return
  }

  if (state.phase === 'mint') {
    if (!state.message || !state.attestation) {
      state.phase = 'attest'
      await save(row, state)
      return
    }
    if (!state.tx.mint) {
      await submit('mint', target.circleWalletId, MESSAGE_TRANSMITTER_V2, 'receiveMessage(bytes,bytes)', [
        state.message,
        state.attestation,
      ])
    } else if (await confirmed('mint')) {
      state.phase = 'done'
      await save(row, state, { status: 'completed', error: null })
    }
  }
}

export interface WalletBalance {
  blockchain: string
  label: string
  address: string
  usdc: string
}

const NETWORK_LABELS: Record<string, string> = {
  MATIC: 'Polygon',
  ETH: 'Ethereum',
  BASE: 'Base',
  ARB: 'Arbitrum',
  AVAX: 'Avalanche',
  OP: 'OP Mainnet',
  UNI: 'Unichain',
  MONAD: 'Monad',
  ARC: 'Arc',
  'MATIC-AMOY': 'Polygon Amoy',
  'ETH-SEPOLIA': 'Ethereum Sepolia',
  'BASE-SEPOLIA': 'Base Sepolia',
  'ARB-SEPOLIA': 'Arbitrum Sepolia',
  'AVAX-FUJI': 'Avalanche Fuji',
  'OP-SEPOLIA': 'OP Sepolia',
}

/**
 * USDC in every wallet the user has (the main one first), fetched at the same
 * time. A wallet whose balance cannot be read is skipped rather than failing
 * the whole screen. `total` adds them all up.
 */
export async function allUsdcBalances(
  userId: string,
  mainWallet?: { circle_wallet_id: string; blockchain: string; address: string } | null,
): Promise<{ wallets: WalletBalance[]; total: string }> {
  const list = await userNetworkWallets(userId)
  if (mainWallet && !list.some((w) => w.blockchain === mainWallet.blockchain)) {
    list.unshift({
      blockchain: mainWallet.blockchain,
      circleWalletId: mainWallet.circle_wallet_id,
      address: mainWallet.address,
    })
  }
  const results = await Promise.all(
    list.map(async (w) => {
      try {
        const balances = await getBalances(w.circleWalletId)
        const usdc = balances.find((b) => isUsdc(b))
        return { w, amount: usdc ? usdc.amount : '0' }
      } catch {
        return null
      }
    }),
  )
  const wallets: WalletBalance[] = []
  let micro = 0
  for (const r of results) {
    if (!r) continue
    const n = Number(r.amount)
    micro += Number.isFinite(n) ? Math.round(n * 1_000_000) : 0
    wallets.push({
      blockchain: r.w.blockchain,
      label: NETWORK_LABELS[r.w.blockchain] || r.w.blockchain,
      address: r.w.address,
      usdc: r.amount,
    })
  }
  return { wallets, total: (micro / 1_000_000).toFixed(6).replace(/\.?0+$/, '') || '0' }
}
