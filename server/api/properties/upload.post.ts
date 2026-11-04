import { randomUUID } from 'node:crypto'
import { uploadPropertyImage } from '../../utils/db'
import { requireAdmin } from '../../utils/propertiesAdmin'

// Saves one photo (sent as base64 by the page, already shrunk) and returns its public link.
export default defineEventHandler(async (event) => {
  await requireAdmin(event, 'property-upload', 40)
  const b = (await readBody<{ data?: unknown; type?: unknown }>(event)) || {}
  if (typeof b.data !== 'string' || b.data.length < 100 || b.data.length > 6_000_000) {
    throw createError({ statusCode: 400, statusMessage: 'The photo is missing or too large' })
  }
  const bytes = Buffer.from(b.data, 'base64')
  if (bytes.length > 4_000_000) {
    throw createError({ statusCode: 400, statusMessage: 'The photo is too large (4 MB maximum)' })
  }
  // Check what the file really is, not what the page says it is.
  let ext = ''
  let type = ''
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    ext = 'jpg'
    type = 'image/jpeg'
  } else if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    ext = 'png'
    type = 'image/png'
  } else if (bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') {
    ext = 'webp'
    type = 'image/webp'
  } else {
    throw createError({ statusCode: 400, statusMessage: 'Only JPG, PNG or WebP photos are allowed' })
  }
  const url = await uploadPropertyImage(`${randomUUID()}.${ext}`, bytes, type)
  return { url }
})
