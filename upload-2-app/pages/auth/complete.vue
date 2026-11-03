<template>
  <div class="fm-auth">
    <div class="fm-auth-card">
      <h1>Signing you in…</h1>
      <p v-if="failed" class="fm-lede">
        That did not work. <NuxtLink to="/login">Go back to log in</NuxtLink>.
      </p>
      <p v-else class="fm-lede" role="status">One moment.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'app' })
useHead({ title: 'Signing in' })

const route = useRoute()
const { completeLogin } = useAuth()
const failed = ref(false)

onMounted(async () => {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const ok = completeLogin({
    access_token: params.get('access_token') || '',
    refresh_token: params.get('refresh_token') || '',
    expires_in: params.get('expires_in') || '3600',
    user: { email: params.get('email') || '' },
  })
  // Remove the tokens from the address bar straight away.
  history.replaceState(null, '', window.location.pathname)
  if (!ok) {
    failed.value = true
    return
  }
  const next = typeof route.query.next === 'string' ? route.query.next : '/wallet'
  await navigateTo(next.startsWith('/') && !next.startsWith('//') ? next : '/wallet')
})
</script>
