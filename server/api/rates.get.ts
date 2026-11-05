import { requireUser } from '../utils/auth'
import { getRates } from '../utils/fx'

// XE exchange rates for the Currencies page.
export default defineEventHandler(async (event) => {
  await requireUser(event)
  return await getRates()
})
