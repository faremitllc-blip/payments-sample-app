import type { H3Event } from 'h3'
import { rateLimit, requireUser } from './auth'
import { isAdminEmail } from './propertiesRules'
import { isStage } from '../../utils/propertyStages'

export async function requireAdmin(event: H3Event, bucket: string, max = 30) {
  const user = await requireUser(event)
  const config = useRuntimeConfig()
  if (!user.emailConfirmed || !isAdminEmail(config.adminEmails, user.email)) {
    throw createError({ statusCode: 403, statusMessage: 'Only an administrator can do that' })
  }
  rateLimit(user.id, bucket, max, 60_000)
  return user
}

/** Keeps only https links, at most 12, no duplicates. */
export function cleanImages(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  for (const v of input) {
    if (typeof v !== 'string') continue
    const url = v.trim().slice(0, 500)
    if (/^https:\/\//.test(url) && !out.includes(url)) out.push(url)
    if (out.length >= 12) break
  }
  return out
}

export function cleanStage(input: unknown): string | null {
  if (input === '' || input === null || input === undefined) return ''
  return isStage(input) ? input : null
}
