/** Rules for the profile page. No network or framework code, so they are easy to test. */

const MAX_AVATAR_CHARS = 160_000
const AVATAR_PREFIX = 'data:image/jpeg;base64,'

/** A tidy display name of 1 to 60 characters, or null if it cannot be used. */
export function cleanDisplayName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const text = value
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length >= 1 && text.length <= 60 ? text : null
}

/**
 * Accepts only a small JPEG data URL (the app makes one in the browser). The
 * base64 start "/9j/" is the JPEG signature, so a renamed file of another kind
 * is refused.
 */
export function isAvatarDataUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_AVATAR_CHARS) {
    return false
  }
  if (!value.startsWith(AVATAR_PREFIX)) {
    return false
  }
  const body = value.slice(AVATAR_PREFIX.length)
  return body.startsWith('/9j/') && body.length > 100 && /^[A-Za-z0-9+/]+={0,2}$/.test(body)
}
