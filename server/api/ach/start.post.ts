import { randomUUID } from 'node:crypto'
import { rateLimit, requireUser } from '../../utils/auth'
import { createTopupRow, getAchCustomer, getProfileRow, getWalletRow, updateTopupRow } from '../../utils/db'
import { achQuote, createTransfer, customerRecord, extraDestination, listLinkedBanks, pickPurpose, quoteRequirements } from '../../utils/owlpay'

// Starts a top-up from the customer's linked US bank account. Harbor pulls the dollars by ACH
// and sends USDC straight to the customer's own Mondo wallet.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  rateLimit(user.id, 'ach-start', 4, 60_000)

  const config = useRuntimeConfig()
  const max = Number(config.topupMaxEur) > 0 ? Number(config.topupMaxEur) : 50
  const b = ((await readBody<{ amount?: unknown; bankId?: unknown }>(event)) || {}) as { amount?: unknown; bankId?: unknown }
  const amount = Math.round(Number(b.amount) * 100) / 100
  if (!Number.isFinite(amount) || amount < 1 || amount > max) {
    throw createError({ statusCode: 400, statusMessage: `Enter an amount from 1 to ${max} USD` })
  }
  const bankId = typeof b.bankId === 'string' ? b.bankId : ''

  const customerUuid = await getAchCustomer(user.id)
  if (!customerUuid) throw createError({ statusCode: 400, statusMessage: 'Set up your profile first' })
  // The bank must be one of this customer's own linked accounts.
  const bank = (await listLinkedBanks(customerUuid)).find((x) => x.id === bankId && x.connected)
  if (!bank) throw createError({ statusCode: 400, statusMessage: 'Choose one of your linked bank accounts' })

  const wallet = await getWalletRow(user.id)
  if (!wallet) throw createError({ statusCode: 400, statusMessage: 'Create your wallet first' })
  if (String(wallet.blockchain).toUpperCase() !== 'MATIC') {
    throw createError({ statusCode: 400, statusMessage: 'Your main wallet is not on Polygon' })
  }

  const quote = await achQuote(customerUuid, amount)
  const schema = await quoteRequirements(quote.id).catch(() => null)
  const profile = await getProfileRow(user.id)
  const name = String(profile?.display_name || user.email.split('@')[0] || 'Mondo customer').slice(0, 80)

  const extra = extraDestination(schema, await customerRecord(customerUuid).catch(() => ({ address: null, birthDate: '', idNumber: '' })))

  const id = randomUUID()
  await createTopupRow({
    id,
    user_id: user.id,
    currency: 'USD',
    amount: amount.toFixed(2),
    status: 'waiting',
    method: 'ach',
    webform_id: null,
    payment_id: null,
    error: null,
  })
  try {
    const transfer = await createTransfer({
      quote_id: quote.id,
      on_behalf_of: customerUuid,
      application_transfer_uuid: id,
      source: { payment_instrument: { linked_bank_account_id: bank.id } },
      destination: {
        beneficiary_info: { beneficiary_name: name, ...extra.info },
        payout_instrument: { address: wallet.address },
        transfer_purpose: pickPurpose(schema),
        is_self_transfer: true,
        ...extra.top,
      },
    })
    await updateTopupRow(id, { webform_id: `ow:${transfer.uuid}`, usdc_amount: quote.usdc })
    return { id, usdc: quote.usdc }
  } catch (err: any) {
    await updateTopupRow(id, {
      status: 'failed',
      error: String(err?.statusMessage || 'Could not start the top-up').slice(0, 240),
    })
    throw err
  }
})
