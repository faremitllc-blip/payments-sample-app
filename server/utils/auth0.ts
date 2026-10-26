import { randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import { cleanCredential } from './clean'

export interface Auth0Settings {
  domain: string
  clientId: string
  clientSecret: string
}

/** Reads the Auth0 settings. Returns null when Google login is not set up. */
export function auth0Settings(): Auth0Settings | null {
  const config = useRuntimeConfig()
  const domain = cleanCredential(config.auth0Domain).replace(/^https?:\/\//, '').replace(/\/+$/, '')
  const clientId = cleanCredential(config.auth0ClientId)
  const clientSecret = cleanCredential(config.auth0ClientSecret)
  if (!domain || !clientId || !clientSecret) {
    return null
  }
  return { domain, clientId, clientSecret }
}

export const AUTH0_COOKIE = 'mo_a0'

/** Where this request came from, e.g. https://getmondo.vercel.app */
export function siteOrigin(event: H3Event): string {
  const url = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true })
  return `${url.protocol}//${url.host}`
}

export function callbackUrl(event: H3Event): string {
  return `${siteOrigin(event)}/api/auth/auth0/callback`
}

export function randomToken(): string {
  return randomBytes(24).toString('base64url')
}

/** Only allow sending people back to a page inside this app. */
export function safeNext(value: unknown): string {
  return typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\')
    ? value.slice(0, 200)
    : '/wallet'
}

export interface IdClaims {
  iss?: string
  aud?: string | string[]
  exp?: number
  nonce?: string
  email?: string
  email_verified?: boolean | string
  name?: string
}

export function decodeJwtPayload(token: string): IdClaims | null {
  const part = token.split('.')[1]
  if (!part) return null
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as IdClaims
  } catch {
    return null
  }
}

/**
 * Checks the ID token Auth0 returned. It came straight from Auth0's token
 * endpoint over TLS in exchange for our one-time code and client secret, so the
 * claims are checked here instead of re-verifying the signature.
 */
export function checkClaims(
  claims: IdClaims | null,
  settings: Auth0Settings,
  nonce: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): { ok: true; email: string } | { ok: false; reason: string } {
  if (!claims) return { ok: false, reason: 'bad_token' }
  if (claims.iss !== `https://${settings.domain}/`) return { ok: false, reason: 'bad_issuer' }
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!aud.includes(settings.clientId)) return { ok: false, reason: 'bad_audience' }
  if (!claims.exp || claims.exp < nowSeconds) return { ok: false, reason: 'expired' }
  if (!nonce || claims.nonce !== nonce) return { ok: false, reason: 'bad_nonce' }
  if (!claims.email || claims.email_verified !== true && claims.email_verified !== 'true') return { ok: false, reason: 'email_not_verified' }
  return { ok: true, email: claims.email.trim().toLowerCase() }
}
