import { rateLimit, requireUser } from '../../utils/auth'
import { createPropertyRow } from '../../utils/db'
import { isAdminEmail } from '../../utils/propertiesRules'
import { poolSettings, readSummary } from '../../utils/properties'

// Lists a property that was already created on the contract. Admin emails only.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const config = useRuntimeConfig()
  if (!user.emailConfirmed || !isAdminEmail(config.adminEmails, user.email)) {
    throw createError({ statusCode: 403, statusMessage: 'Only an administrator can list properties' })
  }
  rateLimit(user.id, 'property-create', 10, 60_000)
  const pool = poolSettings()

  const b = (await readBody<Record<string, unknown>>(event)) || {}
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const onchainId = Number(b.onchainId)
  const title = text(b.title, 120)
  const min = Number(b.minInvestUsdc)
  const imageUrl = text(b.imageUrl, 500)
  if (!Number.isInteger(onchainId) || onchainId < 1 || !title) {
    throw createError({ statusCode: 400, statusMessage: 'A title and the contract property number are required' })
  }
  if (!(min >= 1 && min <= 1_000_000)) {
    throw createError({ statusCode: 400, statusMessage: 'The minimum investment must be at least 1 USDC' })
  }
  if (imageUrl && !/^https:\/\//.test(imageUrl)) {
    throw createError({ statusCode: 400, statusMessage: 'The image link must start with https://' })
  }

  // The property must really exist on the contract.
  const summary = await readSummary(pool, onchainId)
  if (summary.status === 'none') {
    throw createError({ statusCode: 400, statusMessage: 'That property number does not exist on the contract yet' })
  }

  const row = await createPropertyRow({
    onchain_id: onchainId,
    title,
    location: text(b.location, 160),
    description: text(b.description, 4000),
    image_url: imageUrl,
    expected_return: text(b.expectedReturn, 200),
    min_invest_usdc: min,
  })
  if (!row) {
    throw createError({ statusCode: 409, statusMessage: 'That property number is already listed' })
  }
  return { id: row.id }
})
