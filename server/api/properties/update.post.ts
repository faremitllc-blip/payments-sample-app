import { getProperty, removePropertyImage, updatePropertyRow } from '../../utils/db'
import { optionalAmount } from '../../utils/propertiesRules'
import { cleanImages, cleanStage, requireAdmin } from '../../utils/propertiesAdmin'

// Edits a listing: text, photos and build stage. Admin emails only.
export default defineEventHandler(async (event) => {
  await requireAdmin(event, 'property-update', 30)
  const b = (await readBody<Record<string, unknown>>(event)) || {}
  const id = String(b.id || '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Property not found' })
  }
  const current = await getProperty(id)
  if (!current) {
    throw createError({ statusCode: 404, statusMessage: 'Property not found' })
  }

  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const title = text(b.title, 120)
  const min = Number(b.minInvestUsdc)
  if (!title) {
    throw createError({ statusCode: 400, statusMessage: 'A title is required' })
  }
  if (!(min >= 1 && min <= 1_000_000)) {
    throw createError({ statusCode: 400, statusMessage: 'The minimum investment must be at least 1 USDC' })
  }
  const maxInvest = optionalAmount(b.maxInvestUsdc)
  const price = optionalAmount(b.propertyPriceUsdc)
  if (Number.isNaN(maxInvest) || (maxInvest !== null && maxInvest < min)) {
    throw createError({ statusCode: 400, statusMessage: 'The maximum investment must be a number that is not below the minimum' })
  }
  if (Number.isNaN(price)) {
    throw createError({ statusCode: 400, statusMessage: 'The property price must be a positive number' })
  }
  const images = cleanImages(b.images)
  const stage = cleanStage(b.stage)
  if (stage === null) {
    throw createError({ statusCode: 400, statusMessage: 'That stage is not recognised' })
  }

  const log = Array.isArray(current.stage_log) ? [...current.stage_log] : []
  if (stage !== (current.stage || '') && stage !== '') {
    log.push({ stage, at: new Date().toISOString(), note: text(b.stageNote, 300) })
  }

  const row = await updatePropertyRow(id, {
    title,
    location: text(b.location, 160),
    description: text(b.description, 4000),
    expected_return: text(b.expectedReturn, 200),
    min_invest_usdc: min,
    max_invest_usdc: maxInvest,
    property_price_usdc: price,
    images,
    image_url: images[0] || '',
    stage,
    stage_log: log.slice(-30),
  })
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Property not found' })
  }

  const before = [...(current.images || []), ...(current.image_url ? [current.image_url] : [])]
  for (const url of before) {
    if (!images.includes(url)) await removePropertyImage(url)
  }
  return { ok: true }
})
