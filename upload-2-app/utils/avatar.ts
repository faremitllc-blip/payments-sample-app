/**
 * Turns a photo the user picked into a small square JPEG (a data URL) that is
 * cheap to store and show. Runs in the browser.
 */

export const AVATAR_SIZE = 256
const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_CHARS = 150_000

export async function squareAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.')
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('That photo is too large. Choose one under 15 MB.')
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('That photo could not be opened. Try a JPG or PNG.')
  }

  // Crop the biggest centred square, then shrink it.
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_SIZE
  canvas.height = AVATAR_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Your browser cannot prepare photos.')
  }
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE,
  )
  bitmap.close()

  for (const quality of [0.86, 0.72, 0.58]) {
    const url = canvas.toDataURL('image/jpeg', quality)
    if (url.length <= MAX_CHARS) {
      return url
    }
  }
  throw new Error('That photo could not be made small enough. Try another one.')
}
