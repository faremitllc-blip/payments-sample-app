import { useAuth } from '~/composables/useAuth'

export interface Profile {
  displayName: string
  avatar: string
  email: string
}

/** The signed-in user's display name and photo, shared by every screen. */
export function useProfile() {
  const { api } = useAuth()
  const profile = useState<Profile | null>('fm-profile', () => null)

  async function load(force = false): Promise<void> {
    if (profile.value && !force) {
      return
    }
    const result = await api<{ profile: Profile }>('/api/profile')
    profile.value = result.profile
  }

  async function save(fields: { displayName?: string; avatar?: string | null }): Promise<void> {
    const result = await api<{ profile: Profile }>('/api/profile', {
      method: 'POST',
      body: fields as Record<string, unknown>,
    })
    profile.value = result.profile
  }

  function reset() {
    profile.value = null
  }

  return { profile, load, save, reset }
}
