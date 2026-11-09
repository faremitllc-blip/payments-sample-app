import { randomUUID } from 'node:crypto'
import { rateLimit, requireUser } from '../../utils/auth'
import { createTopupRow, listBankAccounts, updateTopupRow } from '../../utils/db'
import { startEuroPayment } from '../../utils/finapi'

// Starts a euro top-up from the user's own bank, using open banking. The payment
// goes to the user's own Bridge euro account, which turns it into USDC in their
// wallet. Mondo never holds the euros.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  rateLimit(user.id, 'topup-euro', 5, 60_000)

  const config = useRuntimeConfig()
  const max = Number(config.topupMaxEur) > 0 ? Number(config.topupMaxEur) : 50
  const b = (await readBody<{ amount?: unknown }>(event)) || {}
  const amount = Math.round(Number(b.amount) * 100) / 100
  if (!Number.isFinite(amount) || amount < 1 || amount > max) {
    throw createError({
      statusCode: 400,
      statusMessage: `Enter an amount from 1 to ${max} EUR`,
    })
  }

  const account = (await listBankAccounts(user.id)).find((a) => a.currency === 'eur')
  if (!account) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Open your EUR bank account on the Bank page first',
    })
  }
  if (account.placeholder) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Create your wallet and connect it to your EUR account on the Bank page first',
    })
  }

  const ins = account.deposit_instructions || {}
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const iban = text(ins.iban).replace(/\s+/g, '')
  const name = text(ins.account_holder_name)
  if (!iban || !name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Your EUR account details are not complete yet. Open the Bank page and try again',
    })
  }
  const reference = text(ins.deposit_message) || text(ins.reference) || 'Mondo top-up'

  const id = randomUUID()
  await createTopupRow({
    id,
    user_id: user.id,
    currency: 'EUR',
    amount: amount.toFixed(2),
    status: 'waiting',
    webform_id: null,
    payment_id: null,
    error: null,
  })

  try {
    const started = await startEuroPayment(id, {
      amount,
      recipientName: name,
      iban,
      bic: text(ins.bic) || undefined,
      purpose: reference.slice(0, 140),
    })
    await updateTopupRow(id, { webform_id: started.webformId })
    return { id, url: started.url, expiresAt: started.expiresAt }
  } catch (err: any) {
    await updateTopupRow(id, {
      status: 'failed',
      error: String(err?.statusMessage || 'Could not start the payment').slice(0, 240),
    })
    throw err
  }
})
