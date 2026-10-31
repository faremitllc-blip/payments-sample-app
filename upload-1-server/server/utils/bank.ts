import {
  getBankCustomer,
  setBankCustomerId,
  type BankCustomerRow,
} from './db'
import { bridgeRequest, type KycLink } from './bridge'
import { memoGet, memoSet } from './memo'

export interface BankStatus {
  customerType: string
  kycStatus: string
  tosStatus: string
  kycLink: string
  tosLink: string
  customerId: string
  approved: boolean
  /** What Bridge has approved for this customer, or null if it is unknown. */
  endorsements: Array<{ name: string; status: string }> | null
}

/**
 * Asks Bridge for the latest verification state of a saved customer. With
 * `cached: true` an answer from the last 15 seconds is reused. Anything that
 * acts on the answer (opening an account, for example) asks without it.
 */
export async function refreshBankStatus(
  row: BankCustomerRow,
  options: { cached?: boolean } = {},
): Promise<BankStatus> {
  const cacheKey = `bank-status:${row.kyc_link_id}`
  if (options.cached) {
    const hit = memoGet<BankStatus>(cacheKey)
    if (hit) {
      return hit
    }
  }

  const fetchCustomer = async (customerId: string) => {
    try {
      const customer = await bridgeRequest<{
        endorsements?: Array<{ name?: string; status?: string }>
      }>(`/customers/${encodeURIComponent(customerId)}`)
      return Array.isArray(customer.endorsements)
        ? customer.endorsements.map((e) => ({
            name: String(e.name || ''),
            status: String(e.status || ''),
          }))
        : null
    } catch {
      // Not essential. Without it the screen simply cannot pre-check approvals.
      return null
    }
  }

  // When the customer id is already saved, both questions are asked at once.
  const linkPromise = bridgeRequest<KycLink>(
    `/kyc_links/${encodeURIComponent(row.kyc_link_id)}`,
  )
  const earlyCustomer = row.customer_id ? fetchCustomer(row.customer_id) : null
  const link = await linkPromise
  const customerId = link.customer_id || row.customer_id || ''
  if (customerId && customerId !== row.customer_id) {
    await setBankCustomerId(row.user_id, customerId)
  }
  let endorsements: BankStatus['endorsements'] = null
  if (customerId) {
    endorsements =
      earlyCustomer && customerId === row.customer_id
        ? await earlyCustomer
        : await fetchCustomer(customerId)
  }
  const kycStatus = link.kyc_status || 'not_started'
  const tosStatus = link.tos_status || 'pending'
  const status: BankStatus = {
    customerType: row.customer_type,
    kycStatus,
    tosStatus,
    kycLink: link.kyc_link || '',
    tosLink: link.tos_link || '',
    customerId,
    approved: kycStatus === 'approved' && tosStatus === 'approved' && !!customerId,
    endorsements,
  }
  // A finished verification rarely changes, so it can be reused for longer.
  memoSet(cacheKey, status, status.approved ? 120_000 : 15_000)
  return status
}

export async function requireApprovedCustomer(
  userId: string,
): Promise<{ row: BankCustomerRow; status: BankStatus }> {
  const row = await getBankCustomer(userId)
  if (!row) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Verify your identity first',
    })
  }
  const status = await refreshBankStatus(row)
  if (!status.approved) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Your verification is not approved yet',
    })
  }
  return { row, status }
}
