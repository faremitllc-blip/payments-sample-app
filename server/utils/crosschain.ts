import { circleSettings, getBalances, isUsdc } from './circle'
import {
  cleanSteps,
  findNetwork,
  type BridgeStepView,
} from './crosschainRules'
import { getWalletRow, listNetworkWallets, updateBridgeTransfer } from './db'

// The App Kit packages are loaded only when a bridge starts, so the rest of the
// app works even before they are installed.
async function loadKit() {
  const flag = String(useRuntimeConfig().bridgeSdkInstalled || '')
  if (!flag) {
    throw createError({
      statusCode: 503,
      statusMessage:
        'Bridging is not switched on yet: add the @circle-fin/app-kit and @circle-fin/adapter-circle-wallets packages and redeploy',
    })
  }
  const kitModule: any = await import('@circle-fin/app-kit')
  const adapterModule: any = await import('@circle-fin/adapter-circle-wallets')
  const settings = circleSettings()
  const adapter = adapterModule.createCircleWalletsAdapter({
    apiKey: settings.apiKey,
    entitySecret: settings.entitySecret,
  })
  const kit = new kitModule.AppKit()
  return { kit, adapter }
}

export interface RunBridgeInput {
  transferId: string
  fromCircle: string
  toCircle: string
  fromAddress: string
  toAddress: string
  amount: string
  retry?: unknown
}

/**
 * Runs the bridge in the background and records progress in the database.
 * It never throws: failures are saved on the transfer so the page can show them.
 */
export async function runBridge(input: RunBridgeInput): Promise<void> {
  const live = !circleSettings().apiKey.startsWith('TEST_API_KEY:')
  const from = findNetwork(input.fromCircle, live)
  const to = findNetwork(input.toCircle, live)
  const steps: BridgeStepView[] = []

  const save = async (status: string, extra: { error?: string; result?: unknown } = {}) => {
    try {
      await updateBridgeTransfer(input.transferId, {
        status,
        steps: cleanSteps(steps) as unknown,
        ...extra,
      })
    } catch {
      // Progress saving must not stop the bridge itself.
    }
  }

  try {
    if (!from || !to) throw new Error('Unsupported network')
    const { kit, adapter } = await loadKit()

    // Save each step as the kit reports it.
    if (typeof kit.on === 'function') {
      kit.on('*', (payload: any) => {
        const name = String(payload?.method || payload?.name || payload?.type || 'step')
        const found = steps.find((s) => s.name === name)
        const next: BridgeStepView = {
          name,
          state: String(payload?.values?.state || payload?.state || 'pending'),
          txHash: payload?.values?.txHash,
          explorerUrl: payload?.values?.explorerUrl,
        }
        if (found) Object.assign(found, next)
        else steps.push(next)
        void save('running')
      })
    }

    const result: any = input.retry
      ? await kit.retryBridge(input.retry, { from: adapter, to: adapter })
      : await kit.bridge({
          from: { adapter, chain: from.kit, address: input.fromAddress },
          to: { adapter, chain: to.kit, address: input.toAddress },
          amount: input.amount,
        })

    const resultSteps = cleanSteps(result?.steps)
    if (resultSteps.length) {
      steps.splice(0, steps.length, ...resultSteps)
    }
    const failed = result?.state === 'error' || steps.some((s) => s.state === 'error')
    if (failed) {
      // Keep the raw result so the transfer can be retried from where it stopped.
      await save('failed', {
        error: 'The bridge stopped part-way. You can retry it.',
        result,
      })
      return
    }
    await save('completed', { result: { state: result?.state || 'success' } })
  } catch (err: any) {
    const message =
      typeof err?.statusMessage === 'string'
        ? err.statusMessage
        : typeof err?.message === 'string'
          ? err.message
          : 'The bridge failed'
    await save('failed', { error: message.slice(0, 300) })
  }
}

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
