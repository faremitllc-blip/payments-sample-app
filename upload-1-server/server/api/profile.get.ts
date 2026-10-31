import { requireUser } from '../utils/auth'
import { getProfileRow } from '../utils/db'

// The signed-in user's own profile: display name and photo.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const row = await getProfileRow(user.id)
  return {
    profile: {
      displayName: row?.display_name || '',
      avatar: row?.avatar || '',
      email: user.email,
    },
  }
})
