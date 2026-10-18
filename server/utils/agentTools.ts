import { monthTotals } from '../../utils/activityStats'
import { refreshBankStatus } from './bank'
import { bridgeMode } from './bridge'
import { getBalances, isUsdc, listTransactions } from './circle'
import { getBankCustomer, getWalletRow, listBankAccounts } from './db'
import {
  checkAction,
  type ActionTool,
  type ReadTool,
} from './agentRules'

/**
 * What the assistant can look up. Everything is read from the signed-in user's
 * own data, found from the verified user id and never from the conversation.
 */
export async function runReadTool(
  name: ReadTool,
  input: Record<string, unknown>,
  userId: string,
): Promise<unknown> {
  const wallet = await getWalletRow(userId)

  switch (name) {
    case 'get_wallet':
      return wallet ? { address: wallet.address, network: wallet.blockchain } : null

    case 'get_balance': {
      if (!wallet) {
        return { error: 'The user has no wallet yet.' }
      }
      const balances = await getBalances(wallet.circle_wallet_id)
      const usdc = balances.find(isUsdc)
      return { usdc: usdc ? usdc.amount : '0' }
    }

    case 'get_recent_activity':
    case 'get_month_summary': {
      if (!wallet) {
        return { error: 'The user has no wallet yet.' }
      }
      const items = (await listTransactions(wallet.circle_wallet_id)).map((t) => {
        const sent = t.transactionType === 'OUTBOUND'
        return {
          direction: (sent ? 'sent' : 'received') as 'sent' | 'received',
          state: t.state,
          amount: t.amounts && t.amounts.length > 0 ? t.amounts[0] : '',
          counterparty: sent ? t.destinationAddress || '' : t.sourceAddress || '',
          date: t.createDate || '',
        }
      })
      if (name === 'get_recent_activity') {
        const limit = Math.min(25, Math.max(1, Number(input.limit) || 10))
        return { transfers: items.slice(0, limit) }
      }
      const now = new Date()
      const last = new Date(now.getFullYear(), now.getMonth() - 1, 15)
      const pick = (t: ReturnType<typeof monthTotals>) => ({
        received: t.received,
        sent: t.sent,
        transfers: t.count,
      })
      return {
        note: 'Based on the latest 50 transfers.',
        this_month: pick(monthTotals(items, now)),
        last_month: pick(monthTotals(items, last)),
      }
    }

    case 'get_bank_overview': {
      if (!bridgeMode().configured) {
        return { error: 'Bank accounts are not switched on in this app.' }
      }
      const row = await getBankCustomer(userId)
      const status = row ? await refreshBankStatus(row) : null
      const accounts = await listBankAccounts(userId)
      return {
        identity_check: status
          ? { approved: status.approved, kyc: status.kycStatus, terms: status.tosStatus }
          : 'not started',
        accounts: accounts.map((a) => ({
          currency: a.currency,
          deposit_details: a.deposit_instructions,
          test_placeholder: Boolean(a.placeholder),
        })),
      }
    }
  }
}

export type Proposal =
  | { ok: true; input: Record<string, string> }
  | { ok: false; error: string }

/**
 * Checks that a proposed action makes sense for this user right now, so the
 * approval card never asks for something that cannot work. Nothing is changed.
 */
export async function checkProposal(
  name: ActionTool,
  input: Record<string, unknown>,
  userId: string,
): Promise<Proposal> {
  const checked = checkAction(name, input)
  if (!checked.ok) {
    return checked
  }
  const wallet = await getWalletRow(userId)

  switch (name) {
    case 'create_wallet':
      return wallet
        ? { ok: false, error: 'The user already has a wallet.' }
        : checked

    case 'send_usdc': {
      if (!wallet) {
        return { ok: false, error: 'The user has no wallet yet, so nothing can be sent.' }
      }
      if (checked.input.to.toLowerCase() === wallet.address.toLowerCase()) {
        return { ok: false, error: 'That is the user\'s own wallet address.' }
      }
      const balances = await getBalances(wallet.circle_wallet_id)
      const usdc = balances.find(isUsdc)
      if (Number(checked.input.amount) > Number(usdc ? usdc.amount : 0)) {
        return {
          ok: false,
          error: `The balance is ${usdc ? usdc.amount : '0'} USDC, which is not enough.`,
        }
      }
      return checked
    }

    case 'start_identity_verification':
      if (!bridgeMode().configured) {
        return { ok: false, error: 'Bank accounts are not switched on in this app.' }
      }
      return (await getBankCustomer(userId))
        ? { ok: false, error: 'The identity check was already started. Use get_bank_overview to see its status.' }
        : checked

    case 'open_bank_account': {
      if (!bridgeMode().configured) {
        return { ok: false, error: 'Bank accounts are not switched on in this app.' }
      }
      const accounts = await listBankAccounts(userId)
      if (accounts.some((a) => a.currency === checked.input.currency)) {
        return { ok: false, error: 'That bank account is already open.' }
      }
      const row = await getBankCustomer(userId)
      const status = row ? await refreshBankStatus(row) : null
      if (!status || !status.approved) {
        return {
          ok: false,
          error: 'The identity check is not approved yet. Offer to start it, or tell the user to finish it first.',
        }
      }
      return checked
    }
  }
}
