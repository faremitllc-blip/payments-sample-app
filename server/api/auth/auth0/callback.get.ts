import {
  AUTH0_COOKIE,
  auth0Settings,
  callbackUrl,
  checkClaims,
  decodeJwtPayload,
  safeNext,
} from '../../../utils/auth0'
import { rateLimit } from '../../../utils/auth'

function fail(event: any, code: string, extra = '') {
  deleteCookie(event, AUTH0_COOKIE, { path: '/api/auth/auth0' })
  return sendRedirect(event, `/login?error=${encodeURIComponent(code)}${extra}`, 302)
}

// Step 2: Auth0 sends the person back here with a one-time code. We swap it for
// their verified email, then start a normal Mondo (Supabase) session for it.
export default defineEventHandler(async (event) => {
  const settings = auth0Settings()
  if (!settings) return await fail(event, 'google_off')

  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  rateLimit(ip, 'auth0-callback', 20, 60_000)

  const query = getQuery(event)
  if (typeof query.error === 'string') return await fail(event, 'google_cancelled')

  let saved: { state?: string; nonce?: string; next?: string } = {}
  try {
    saved = JSON.parse(getCookie(event, AUTH0_COOKIE) || '{}')
  } catch {
    saved = {}
  }
  const code = typeof query.code === 'string' ? query.code : ''
  if (!code || !saved.state || query.state !== saved.state || !saved.nonce) {
    return await fail(event, 'google_state')
  }

  let idToken = ''
  let accessToken = ''
  try {
    const tokens = await $fetch<{ id_token?: string; access_token?: string }>(`https://${settings.domain}/oauth/token`, {
      method: 'POST',
      body: {
        grant_type: 'authorization_code',
        client_id: settings.clientId,
        client_secret: settings.clientSecret,
        code,
        redirect_uri: callbackUrl(event),
      },
    })
    idToken = tokens.id_token || ''
    accessToken = tokens.access_token || ''
  } catch (err: any) {
    console.error('auth0 token exchange failed', err?.statusCode, err?.data?.error, err?.data?.error_description)
    return await fail(event, 'google_exchange')
  }

  let claims = decodeJwtPayload(idToken)
  // Some logins (Apple, mostly) leave the email out of the ID token. Ask Auth0's
  // userinfo endpoint, which uses the profile Auth0 holds for the person.
  if (claims && !claims.email && accessToken) {
    try {
      const info = await $fetch<any>(`https://${settings.domain}/userinfo`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (info && typeof info.email === 'string' && info.email) {
        claims = {
          ...claims,
          email: info.email,
          email_verified: info.email_verified,
          sub: claims.sub || info.sub,
        }
      }
    } catch {
      // Fall through: the check below reports the missing email.
    }
  }

  const checked = checkClaims(claims, settings, saved.nonce)
  if (!checked.ok) {
    // Report which fields the login had (names only, never values) to help fix setup.
    const keys = claims ? Object.keys(claims).filter((k) => /^[a-z_]+$/.test(k)).slice(0, 20).join(',') : ''
    const idp = typeof claims?.sub === 'string' ? claims.sub.split('|')[0].slice(0, 20) : ''
    return await fail(
      event,
      `google_${checked.reason}`,
      `&idp=${encodeURIComponent(idp)}&fields=${encodeURIComponent(keys)}`,
    )
  }

  // Start a Supabase session for this verified email (created on first use).
  const config = useRuntimeConfig()
  const baseUrl = String(config.public.supabaseUrl || '')
  const anonKey = String(config.public.supabaseAnonKey || '')
  const serviceKey = String(config.supabaseServiceRoleKey || '')
  if (!baseUrl || !anonKey || !serviceKey) return await fail(event, 'google_server')

  const why = (stage: string, err: any) => {
    const status = err?.statusCode || err?.status || 0
    console.error(`supabase ${stage} failed`, status, err?.data?.msg || err?.data?.message || err?.message)
    return fail(
      event,
      'google_session',
      `&stage=${encodeURIComponent(stage)}&status=${encodeURIComponent(String(status))}`,
    )
  }

  let link: any
  try {
    link = await $fetch<any>(`${baseUrl}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      body: { type: 'magiclink', email: checked.email },
    })
  } catch (err: any) {
    return await why('link', err)
  }
  let tokenHash = typeof link?.hashed_token === 'string' ? link.hashed_token : ''
  if (!tokenHash && typeof link?.action_link === 'string') {
    try {
      tokenHash = new URL(link.action_link).searchParams.get('token') || ''
    } catch {
      tokenHash = ''
    }
  }
  if (!tokenHash) return await why('hash', {})

  // Newer Supabase versions call this type "email"; older ones "magiclink".
  let session: any = null
  let lastErr: any = null
  for (const type of ['email', 'magiclink']) {
    try {
      session = await $fetch<any>(`${baseUrl}/auth/v1/verify`, {
        method: 'POST',
        headers: { apikey: anonKey },
        body: { type, token_hash: tokenHash },
      })
      if (session?.access_token && session?.refresh_token) break
      session = null
    } catch (err: any) {
      lastErr = err
    }
  }
  if (!session) return await why('verify', lastErr || {})

  {
    deleteCookie(event, AUTH0_COOKIE, { path: '/api/auth/auth0' })
    // Tokens go in the URL fragment, which browsers never send to any server.
    const frag = new URLSearchParams({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: String(session.expires_in || 3600),
      email: session.user?.email || checked.email,
    })
    const next = encodeURIComponent(safeNext(saved.next))
    return await sendRedirect(event, `/auth/complete?next=${next}#${frag.toString()}`, 302)
  }
})
