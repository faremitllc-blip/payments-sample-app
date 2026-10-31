import { rateLimit, requireUser } from '../utils/auth'
import { saveProfileRow } from '../utils/db'
import { cleanDisplayName, isAvatarDataUrl } from '../utils/profileRules'

interface ProfileBody {
  displayName?: unknown
  avatar?: unknown
}

// Updates the signed-in user's display name and/or photo. Only the fields sent
// change. Sending avatar as null removes the photo.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  rateLimit(user.id, 'profile', 10, 60_000)

  const body = (await readBody<ProfileBody>(event)) || {}
  const fields: { display_name?: string | null; avatar?: string | null } = {}

  if ('displayName' in body) {
    if (body.displayName === '' || body.displayName === null) {
      fields.display_name = null
    } else {
      const name = cleanDisplayName(body.displayName)
      if (!name) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Use a name of 1 to 60 characters',
        })
      }
      fields.display_name = name
    }
  }

  if ('avatar' in body) {
    if (body.avatar === null) {
      fields.avatar = null
    } else if (isAvatarDataUrl(body.avatar)) {
      fields.avatar = body.avatar
    } else {
      throw createError({
        statusCode: 400,
        statusMessage: 'That photo could not be used. Try a different one',
      })
    }
  }

  if (Object.keys(fields).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Nothing to save' })
  }

  const row = await saveProfileRow(user.id, fields)
  return {
    profile: {
      displayName: row.display_name || '',
      avatar: row.avatar || '',
      email: user.email,
    },
  }
})
