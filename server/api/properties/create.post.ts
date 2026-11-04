import { rateLimit, requireUser } from '../../utils/auth'
import { createPropertyRow } from '../../utils/db'
import { isAdminEmail, optionalAmount } from '../../utils/propertiesRules'
import { poolSettings, readSummary } from '../../utils/properties'
import { cleanImages, cleanStage } from '../../utils/propertiesAdmin'

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
  const maxInvest = optionalAmount(b.maxInvestUsdc)
  const price = optionalAmount(b.propertyPriceUsdc)
  if (Number.isNaN(maxInvest) || (maxInvest !== null && maxInvest < min) || Number.isNaN(price)) {
    throw createError({ statusCode: 400, statusMessage: 'Check the maximum investment and property price' })
  }
  const images = cleanImages(b.images)
  const stage = cleanStage(b.stage)
  if (stage === null) {
    throw createError({ statusCode: 400, statusMessage: 'That stage is not recognised' })
  }
  if (!Number.isInteger(onchainId) || onchainId < 1 || !title) {
    throw createError({ statusCode: 400, statusMessage: 'A title and the contract property number are required' })
  }
  if (!(min >= 1 && min <= 1_000_000)) {
    throw createError({ statusCode: 400, statusMessage: 'The minimum investment must be at least 1 USDC' })
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
    image_url: images[0] || '',
    images,
    stage,
    stage_log: stage ? [{ stage, at: new Date().toISOString(), note: '' }] : [],
    expected_return: text(b.expectedReturn, 200),
    min_invest_usdc: min,
    max_invest_usdc: maxInvest,
    property_price_usdc: price,
  })
  if (!row) {
    throw createError({ statusCode: 409, statusMessage: 'That property number is already listed' })
  }
  return { id: row.id }
})
