import { AUTH0_COOKIE, auth0Settings, callbackUrl, randomToken, safeNext } from '../../../utils/auth0'

// Step 1 of "Continue with Google": sends the browser to Auth0, which sends it on to Google.
export default defineEventHandler(async (event) => {
  const settings = auth0Settings()
  if (!settings) {
    return await sendRedirect(event, '/login?error=google_off', 302)
  }
  const state = randomToken()
  const nonce = randomToken()
  const next = safeNext(getQuery(event).next)

  setCookie(event, AUTH0_COOKIE, JSON.stringify({ state, nonce, next }), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api/auth/auth0',
    maxAge: 600,
  })

  const url = new URL(`https://${settings.domain}/authorize`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', settings.clientId)
  url.searchParams.set('redirect_uri', callbackUrl(event))
  url.searchParams.set('scope', 'openid profile email')
  url.searchParams.set('state', state)
  url.searchParams.set('nonce', nonce)
  url.searchParams.set('connection', 'google-oauth2')
  url.searchParams.set('prompt', 'select_account')
  return await sendRedirect(event, url.toString(), 302)
})
