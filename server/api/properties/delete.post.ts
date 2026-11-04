import { countInvestmentsForProperty, deletePropertyRow, getProperty, removePropertyImage } from '../../utils/db'
import { requireAdmin } from '../../utils/propertiesAdmin'

// Removes a listing from the app. Refused once anyone has invested through the app,
// so no investment record is ever lost. The contract itself is not touched.
export default defineEventHandler(async (event) => {
  await requireAdmin(event, 'property-delete', 10)
  const b = (await readBody<{ id?: unknown }>(event)) || {}
  const id = String(b.id || '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Property not found' })
  }
  const property = await getProperty(id)
  if (!property) {
    throw createError({ statusCode: 404, statusMessage: 'Property not found' })
  }
  if ((await countInvestmentsForProperty(id)) > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'People have already invested in this property, so it cannot be removed from the app',
    })
  }
  await deletePropertyRow(id)
  for (const url of [...(property.images || []), property.image_url]) {
    if (url) await removePropertyImage(url)
  }
  return { ok: true }
})
