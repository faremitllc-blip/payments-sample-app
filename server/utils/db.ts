import { memoDelete, memoGet, memoSet } from './memo'

/**
 * Minimal Supabase database access over its REST API (PostgREST), using the
 * service role key. The key only exists on the server. The tables have row
 * level security switched on with no policies, so browsers cannot read them
 * directly; they go through the routes in server/api instead.
 */

export interface WalletRow {
  user_id: string
  circle_wallet_id: string
  address: string
  blockchain: string
  created_at?: string
}

export interface NetworkWalletRow {
  user_id: string
  blockchain: string
  circle_wallet_id: string
  address: string
  created_at?: string
}

export interface BridgeTransferRow {
  id: string
  user_id: string
  from_chain: string
  to_chain: string
  amount: string
  status: string
  steps: unknown
  result?: unknown
  error?: string | null
  created_at?: string
  updated_at?: string
}

export interface BankCustomerRow {
  user_id: string
  kyc_link_id: string
  customer_id: string | null
  customer_type: string
  created_at?: string
}

export interface BankAccountRow {
  user_id: string
  currency: string
  bridge_account_id: string
  deposit_instructions: Record<string, unknown>
  /** True for test accounts opened before the user had a wallet. */
  placeholder?: boolean
  created_at?: string
}

interface DbOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: Record<string, unknown>
  prefer?: string
}

async function dbRequest<T>(
  path: string,
  options: DbOptions = {},
): Promise<T> {
  const config = useRuntimeConfig()
  const baseUrl = String(config.public.supabaseUrl || '')
  const serviceKey = String(config.supabaseServiceRoleKey || '')

  if (!baseUrl || !serviceKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'The database is not configured on the server',
    })
  }

  const headers: Record<string, string> = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }
  if (options.prefer) {
    headers.Prefer = options.prefer
  }

  try {
    return await $fetch<any>(`${baseUrl}/rest/v1/${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body,
    })
  } catch (err: any) {
    console.error('Database request failed', path, err?.statusCode, err?.data)
    // A missing table means a setup SQL file has not been run yet. Say so,
    // instead of a vague failure, so the fix is obvious.
    const code = String(err?.data?.code || '')
    if (code === 'PGRST205' || code === '42P01') {
      const table = path.split('?')[0]
      throw createError({
        statusCode: 503,
        statusMessage: `The "${table}" table is missing. Run the latest SQL file from the supabase folder in the Supabase SQL Editor`,
        data: { missingTable: table },
      })
    }
    throw createError({
      statusCode: 502,
      statusMessage: 'The database request failed',
    })
  }
}

// A wallet never changes once it exists, so a found wallet is remembered for a
// couple of minutes. "No wallet yet" is never remembered.
export async function getWalletRow(userId: string): Promise<WalletRow | null> {
  const key = `wallet:${userId}`
  const cached = memoGet<WalletRow>(key)
  if (cached) {
    return cached
  }
  const rows = await dbRequest<WalletRow[]>(
    `wallets?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`,
  )
  if (rows.length === 0) {
    return null
  }
  memoSet(key, rows[0], 120_000)
  return rows[0]
}

export async function saveWalletRow(row: WalletRow): Promise<WalletRow> {
  const rows = await dbRequest<WalletRow[]>('wallets', {
    method: 'POST',
    body: { ...row },
    prefer: 'resolution=ignore-duplicates,return=representation',
  })
  if (rows.length > 0) {
    memoDelete(`wallet:${row.user_id}`)
    return rows[0]
  }
  // Another request saved a wallet for this user first. Use that one.
  const existing = await getWalletRow(row.user_id)
  if (!existing) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Could not save the wallet',
    })
  }
  return existing
}

export async function getSetting(key: string): Promise<string | null> {
  const rows = await dbRequest<Array<{ key: string; value: string }>>(
    `app_settings?key=eq.${encodeURIComponent(key)}&select=key,value&limit=1`,
  )
  return rows.length > 0 ? rows[0].value : null
}

export async function saveSetting(key: string, value: string): Promise<void> {
  await dbRequest<unknown>('app_settings', {
    method: 'POST',
    body: { key, value },
    prefer: 'resolution=ignore-duplicates,return=minimal',
  })
}

export async function getBankCustomer(
  userId: string,
): Promise<BankCustomerRow | null> {
  const rows = await dbRequest<BankCustomerRow[]>(
    `bank_customers?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`,
  )
  return rows.length > 0 ? rows[0] : null
}

export async function saveBankCustomer(
  row: BankCustomerRow,
): Promise<BankCustomerRow> {
  const rows = await dbRequest<BankCustomerRow[]>('bank_customers', {
    method: 'POST',
    body: { ...row },
    prefer: 'resolution=ignore-duplicates,return=representation',
  })
  if (rows.length > 0) {
    return rows[0]
  }
  const existing = await getBankCustomer(row.user_id)
  if (!existing) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Could not save the verification',
    })
  }
  return existing
}

export async function setBankCustomerId(
  userId: string,
  customerId: string,
): Promise<void> {
  await dbRequest<unknown>(
    `bank_customers?user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      body: { customer_id: customerId },
      prefer: 'return=minimal',
    },
  )
}

export async function listBankAccounts(
  userId: string,
): Promise<BankAccountRow[]> {
  return await dbRequest<BankAccountRow[]>(
    `bank_accounts?user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.asc`,
  )
}

export async function markBankAccountConnected(
  userId: string,
  currency: string,
): Promise<void> {
  await dbRequest<unknown>(
    `bank_accounts?user_id=eq.${encodeURIComponent(userId)}&currency=eq.${encodeURIComponent(currency)}`,
    {
      method: 'PATCH',
      body: { placeholder: false },
      prefer: 'return=minimal',
    },
  )
}

export async function saveBankAccount(
  row: BankAccountRow,
): Promise<BankAccountRow> {
  const { placeholder, ...rest } = row
  const rows = await dbRequest<BankAccountRow[]>('bank_accounts', {
    method: 'POST',
    body: placeholder ? { ...rest, placeholder: true } : { ...rest },
    prefer: 'resolution=ignore-duplicates,return=representation',
  })
  if (rows.length > 0) {
    return rows[0]
  }
  const existing = (await listBankAccounts(row.user_id)).find(
    (a) => a.currency === row.currency,
  )
  if (!existing) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Could not save the bank account',
    })
  }
  return existing
}

export interface ProfileRow {
  user_id: string
  display_name: string | null
  avatar: string | null
  updated_at?: string
}

export async function getProfileRow(userId: string): Promise<ProfileRow | null> {
  try {
    const rows = await dbRequest<ProfileRow[]>(
      `profiles?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`,
    )
    return rows.length > 0 ? rows[0] : null
  } catch (err: any) {
    // Until add-profiles.sql has been run, the app still works without a profile.
    if (err?.data?.missingTable === 'profiles') {
      return null
    }
    throw err
  }
}

/** Saves only the fields given, leaving the others as they were. */
export async function saveProfileRow(
  userId: string,
  fields: { display_name?: string | null; avatar?: string | null },
): Promise<ProfileRow> {
  const rows = await dbRequest<ProfileRow[]>('profiles?on_conflict=user_id', {
    method: 'POST',
    body: { user_id: userId, ...fields, updated_at: new Date().toISOString() },
    prefer: 'resolution=merge-duplicates,return=representation',
  })
  if (rows.length === 0) {
    throw createError({ statusCode: 500, statusMessage: 'Could not save your profile' })
  }
  return rows[0]
}

// ---- Wallets on other networks, and bridge transfers ----

export async function listNetworkWallets(userId: string): Promise<NetworkWalletRow[]> {
  return await dbRequest<NetworkWalletRow[]>(
    `network_wallets?user_id=eq.${encodeURIComponent(userId)}&select=*`,
  )
}

export async function saveNetworkWallet(
  row: NetworkWalletRow,
): Promise<NetworkWalletRow> {
  const rows = await dbRequest<NetworkWalletRow[]>('network_wallets', {
    method: 'POST',
    body: { ...row },
    prefer: 'resolution=ignore-duplicates,return=representation',
  })
  if (rows.length > 0) {
    return rows[0]
  }
  const existing = (await listNetworkWallets(row.user_id)).find(
    (w) => w.blockchain === row.blockchain,
  )
  if (!existing) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Could not save the wallet',
    })
  }
  return existing
}

/** Returns the new row, or null when a transfer with this id already exists. */
export async function createBridgeTransfer(
  row: BridgeTransferRow,
): Promise<BridgeTransferRow | null> {
  const rows = await dbRequest<BridgeTransferRow[]>('bridge_transfers', {
    method: 'POST',
    body: { ...row },
    prefer: 'resolution=ignore-duplicates,return=representation',
  })
  return rows.length > 0 ? rows[0] : null
}

export async function getBridgeTransfer(
  userId: string,
  id: string,
): Promise<BridgeTransferRow | null> {
  const rows = await dbRequest<BridgeTransferRow[]>(
    `bridge_transfers?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`,
  )
  return rows.length > 0 ? rows[0] : null
}

export async function listBridgeTransfers(
  userId: string,
  limit = 20,
): Promise<BridgeTransferRow[]> {
  return await dbRequest<BridgeTransferRow[]>(
    `bridge_transfers?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,from_chain,to_chain,amount,status,steps,result,error,created_at,updated_at&order=created_at.desc&limit=${limit}`,
  )
}

export async function updateBridgeTransfer(
  id: string,
  patch: Partial<Pick<BridgeTransferRow, 'status' | 'steps' | 'result' | 'error'>>,
): Promise<void> {
  await dbRequest<unknown>(`bridge_transfers?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { ...patch, updated_at: new Date().toISOString() },
    prefer: 'return=minimal',
  })
}

export async function getBridgeTransferResult(
  userId: string,
  id: string,
): Promise<unknown> {
  const rows = await dbRequest<Array<{ result?: unknown }>>(
    `bridge_transfers?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}&select=result&limit=1`,
  )
  return rows.length > 0 ? rows[0].result : null
}
