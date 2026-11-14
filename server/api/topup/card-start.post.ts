import { randomUUID } from 'node:crypto'
import { rateLimit, requireUser } from '../../utils/auth'
import { createTopupRow, getWalletRow, updateTopupRow } from '../../utils/db'
import { startCardPayment } from '../../utils/getmondo'
import { siteOrigin } from '../../utils/openbanking'

// Starts a euro card top-up through getMondo. The card details go straight to getMondo and
// are not stored or logged. USDC is sent to the customer's wallet once getMondo confirms.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  rateLimit(user.id, 'topup-card', 3, 60_000)

  const config = useRuntimeConfig()
  const max = Number(config.topupMaxEur) > 0 ? Number(config.topupMaxEur) : 50
  const b = ((await readBody<Record<string, unknown>>(event)) || {}) as Record<string, unknown>
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const bad = (m: string) => createError({ statusCode: 400, statusMessage: m })

  const amount = Math.round(Number(b.amount) * 100) / 100
  if (!Number.isFinite(amount) || amount < 1 || amount > max) {
    throw bad(`Enter an amount from 1 to ${max} EUR`)
  }

  const cardNumber = text(b.cardNumber).replace(/[\s-]/g, '')
  if (!/^\d{16,19}$/.test(cardNumber) || !luhn(cardNumber)) throw bad('Check the card number')
  const first = cardNumber[0]
  if (first !== '4' && first !== '5') throw bad('Only Visa and Mastercard cards are accepted')

  const expMonth = text(b.expMonth).padStart(2, '0')
  const expYear = text(b.expYear)
  const nowYear = new Date().getFullYear()
  if (!/^(0[1-9]|1[0-2])$/.test(expMonth) || !/^\d{4}$/.test(expYear) || Number(expYear) < nowYear || Number(expYear) > nowYear + 20) {
    throw bad('Check the card expiry date')
  }
  if (Number(expYear) === nowYear && Number(expMonth) < new Date().getMonth() + 1) throw bad('This card has expired')
  const cvv = text(b.cvv)
  if (!/^\d{3,4}$/.test(cvv)) throw bad('Check the card security code')

  const name = text(b.name).slice(0, 200)
  if (name.length < 2) throw bad('Enter the name on the card')
  const phoneCountry = text(b.phoneCountry).toUpperCase()
  const citizenship = text(b.citizenship).toUpperCase()
  if (!/^[A-Z]{3}$/.test(phoneCountry) || !/^[A-Z]{3}$/.test(citizenship)) {
    throw bad('Use 3-letter country codes, for example SOM or GBR')
  }
  const phone = text(b.phone).replace(/\D/g, '').slice(0, 15)
  if (phone.length < 5) throw bad('Enter your phone number')
  const dob = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(b.birthDate))
  if (!dob || Number(dob[1]) < 1900 || Number(dob[1]) > nowYear - 16) throw bad('Enter your date of birth')

  // The USDC goes to the customer's wallet, so it has to exist.
  if (!(await getWalletRow(user.id))) throw bad('Create your wallet first')

  const id = randomUUID()
  await createTopupRow({
    id,
    user_id: user.id,
    currency: 'EUR',
    amount: amount.toFixed(2),
    status: 'waiting',
    method: 'card',
    webform_id: null,
    payment_id: null,
    error: null,
  })

  try {
    const started = await startCardPayment({
      amount,
      currency: 'EUR',
      sessionId: id,
      cardNumber,
      expMonth,
      expYear,
      cvv,
      name,
      email: user.email,
      phoneCountry,
      phone,
      birthYear: dob[1],
      birthMonth: dob[2],
      birthDay: dob[3],
      citizenship,
      ip: getRequestIP(event, { xForwardedFor: true }) || undefined,
      origin: siteOrigin(event),
    })
    await updateTopupRow(id, { webform_id: `gm:${started.sessionId}`, payment_id: started.transactionId || null })
    return { id, redirectUrl: started.redirectUrl }
  } catch (err: any) {
    await updateTopupRow(id, {
      status: 'failed',
      error: String(err?.statusMessage || 'Could not start the payment').slice(0, 240),
    })
    throw err
  }
})

function luhn(digits: string): boolean {
  let sum = 0
  let alt = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i])
    if (alt) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alt = !alt
  }
  return sum % 10 === 0
}
