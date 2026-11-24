import { rateLimit, requireUser } from '../../utils/auth'
import { getAchCustomer, saveAchCustomer } from '../../utils/db'
import { createCustomer } from '../../utils/owlpay'

// Creates the customer record the bank service needs. The identity check itself happens on the
// bank service's own pages.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  rateLimit(user.id, 'ach-customer', 5, 60_000)

  if (await getAchCustomer(user.id)) {
    throw createError({ statusCode: 409, statusMessage: 'Your profile is already set up' })
  }
  const b = ((await readBody<Record<string, unknown>>(event)) || {}) as Record<string, unknown>
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const firstName = text(b.firstName)
  const lastName = text(b.lastName)
  const phone = text(b.phone)
  const birthDate = text(b.birthDate)
  if (!/^[\p{L} '.-]{1,60}$/u.test(firstName) || !/^[\p{L} '.-]{1,60}$/u.test(lastName)) {
    throw createError({ statusCode: 400, statusMessage: 'Enter your first and last name as on your ID' })
  }
  if (!/^[0-9 ()+-]{7,20}$/.test(phone)) {
    throw createError({ statusCode: 400, statusMessage: 'Enter a US phone number, for example 555-555-1234' })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(Date.parse(birthDate))) {
    throw createError({ statusCode: 400, statusMessage: 'Enter your date of birth as YYYY-MM-DD' })
  }
  const age = (Date.now() - Date.parse(birthDate)) / (365.25 * 86_400_000)
  if (age < 18 || age > 120) {
    throw createError({ statusCode: 400, statusMessage: 'You must be at least 18 years old' })
  }

  const customer = await createCustomer({ firstName, lastName, email: user.email, phone, birthDate })
  await saveAchCustomer(user.id, customer.uuid)
  return { ok: true }
})
