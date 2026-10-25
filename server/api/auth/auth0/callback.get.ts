import {
  AUTH0_COOKIE,
  auth0Settings,
  callbackUrl,
  checkClaims,
  decodeJwtPayload,
  safeNext,
} from '../../../utils/auth0'
import { rateLimit } from '../../../utils/auth'

function fail(event: any, code: string) {
  deleteCookie(event, AUTH0_COOKIE, { path: '/api/auth/auth0' })
  return sendRedirect(event, `/login?error=${encodeURIComponent(code)}`, 302)
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
  try {
    const tokens = await $fetch<{ id_token?: string }>(`https://${settings.domain}/oauth/token`, {
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
  } catch {
    return await fail(event, 'google_exchange')
  }

  const checked = checkClaims(decodeJwtPayload(idToken), settings, saved.nonce)
  if (!checked.ok) return await fail(event, `google_${checked.reason}`)

  // Start a Supabase session for this verified email (created on first use).
  const config = useRuntimeConfig()
  const baseUrl = String(config.public.supabaseUrl || '')
  const anonKey = String(config.public.supabaseAnonKey || '')
  const serviceKey = String(config.supabaseServiceRoleKey || '')
  if (!baseUrl || !anonKey || !serviceKey) return await fail(event, 'google_server')

  try {
    const link = await $fetch<any>(`${baseUrl}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      body: { type: 'magiclink', email: checked.email },
    })
    let tokenHash = typeof link?.hashed_token === 'string' ? link.hashed_token : ''
    if (!tokenHash && typeof link?.action_link === 'string') {
      tokenHash = new URL(link.action_link).searchParams.get('token') || ''
    }
    if (!tokenHash) return await fail(event, 'google_session')

    const session = await $fetch<any>(`${baseUrl}/auth/v1/verify`, {
      method: 'POST',
      headers: { apikey: anonKey },
      body: { type: 'magiclink', token_hash: tokenHash },
    })
    if (!session?.access_token || !session?.refresh_token) {
      return await fail(event, 'google_session')
    }

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
  } catch {
    return await fail(event, 'google_session')
  }
})
