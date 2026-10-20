import type { BankCurrency } from '~/utils/bank'

export interface BankStatus {
  customerType: 'individual' | 'business' | string
  kycStatus: string
  tosStatus: string
  kycLink: string
  tosLink: string
  customerId: string
  approved: boolean
  endorsements: Array<{ name: string; status: string }> | null
}

export interface BankAccount {
  currency: BankCurrency
  instructions: Record<string, unknown>
  /** A test account that is not yet pointed at the user's wallet. */
  placeholder?: boolean
}

export interface BankDeposit {
  id: string
  currency: string
  type: string
  amount: string
  date: string
}

const CACHE_PREFIX = 'mondo-bank-v1:'

/**
 * Shared state for the Bank accounts screen.
 *
 * The last answer is kept on this device (per signed-in email), so the screen
 * can show it at once and refresh it in the background. Verification links are
 * never saved. The saved copy is removed when the user logs out.
 */
export function useBank() {
  const { api, session, load: loadSession } = useAuth()

  const configured = useState<boolean>('fm-bank-configured', () => true)
  const live = useState<boolean>('fm-bank-live', () => false)
  const status = useState<BankStatus | null>('fm-bank-status', () => null)
  const accounts = useState<BankAccount[]>('fm-bank-accounts', () => [])
  const deposits = useState<BankDeposit[]>('fm-bank-deposits', () => [])
  // True once there is something to show, either loaded now or saved earlier.
  const loaded = useState<boolean>('fm-bank-loaded', () => false)

  function cacheKey(): string {
    return CACHE_PREFIX + (session.value?.email || '').toLowerCase()
  }

  function saveCache(): void {
    if (!import.meta.client || !session.value) {
      return
    }
    try {
      const safeStatus = status.value
        ? { ...status.value, kycLink: '', tosLink: '' }
        : null
      localStorage.setItem(
        cacheKey(),
        JSON.stringify({
          configured: configured.value,
          live: live.value,
          status: safeStatus,
          accounts: accounts.value,
          deposits: deposits.value,
        }),
      )
    } catch {
      // Storage can be full or blocked. The screen still works without it.
    }
  }

  /** Fills the screen from the saved copy. Returns true when there was one. */
  function restore(): boolean {
    if (loaded.value) {
      return true
    }
    if (!import.meta.client) {
      return false
    }
    loadSession()
    if (!session.value) {
      return false
    }
    try {
      const raw = localStorage.getItem(cacheKey())
      if (!raw) {
        return false
      }
      const saved = JSON.parse(raw)
      configured.value = saved.configured !== false
      live.value = Boolean(saved.live)
      status.value = saved.status || null
      accounts.value = Array.isArray(saved.accounts) ? saved.accounts : []
      deposits.value = Array.isArray(saved.deposits) ? saved.deposits : []
      loaded.value = true
      return true
    } catch {
      return false
    }
  }

  /** `fresh` skips the 15-second server cache, e.g. after the user finishes verification. */
  async function load(fresh = false): Promise<void> {
    const result = await api<{
      configured: boolean
      live: boolean
      status: BankStatus | null
      accounts: BankAccount[]
    }>(fresh ? '/api/bank?fresh=1' : '/api/bank')
    configured.value = result.configured
    live.value = result.live
    status.value = result.status
    accounts.value = result.accounts
    loaded.value = true
    saveCache()
  }

  async function loadDeposits(): Promise<void> {
    if (accounts.value.length === 0) {
      deposits.value = []
      return
    }
    const result = await api<{ deposits: BankDeposit[] }>('/api/bank/history')
    deposits.value = result.deposits
    saveCache()
  }

  async function startVerification(
    fullName: string,
    type: 'individual' | 'business',
  ): Promise<void> {
    const result = await api<{ status: BankStatus }>('/api/bank/kyc', {
      method: 'POST',
      body: { fullName, type },
    })
    status.value = result.status
  }

  async function openAccount(currency: BankCurrency): Promise<void> {
    const result = await api<{ account: BankAccount }>('/api/bank/accounts', {
      method: 'POST',
      body: { currency },
    })
    accounts.value = [
      ...accounts.value.filter((a) => a.currency !== currency),
      result.account,
    ]
    saveCache()
  }

  async function connectWallet(): Promise<void> {
    await api('/api/bank/connect-wallet', { method: 'POST' })
    await load()
  }

  async function euroVerificationLink(): Promise<string> {
    const result = await api<{ url: string }>('/api/bank/endorsement-link', {
      method: 'POST',
      body: { endorsement: 'sepa' },
    })
    return result.url
  }

  async function simulateApproval(): Promise<void> {
    const result = await api<{ status: BankStatus }>(
      '/api/bank/simulate-kyc',
      { method: 'POST' },
    )
    status.value = result.status
  }

  async function simulateDeposit(
    currency: BankCurrency,
    amount: string,
  ): Promise<void> {
    await api('/api/bank/simulate-deposit', {
      method: 'POST',
      body: { currency, amount },
    })
  }

  function reset(): void {
    try {
      localStorage.removeItem(cacheKey())
    } catch {
      // Nothing saved, or storage is blocked.
    }
    status.value = null
    accounts.value = []
    deposits.value = []
    loaded.value = false
  }

  return {
    configured,
    live,
    status,
    accounts,
    deposits,
    loaded,
    restore,
    load,
    loadDeposits,
    startVerification,
    openAccount,
    connectWallet,
    euroVerificationLink,
    simulateApproval,
    simulateDeposit,
    reset,
  }
}
