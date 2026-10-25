<template>
  <div class="fm-auth">
    <div class="fm-auth-card">
      <h1>Welcome back</h1>
      <p class="fm-lede">Log in to see your wallet.</p>

      <v-alert
        v-if="error"
        type="error"
        variant="tonal"
        class="mb-4"
        role="alert"
      >
        {{ error }}
      </v-alert>

      <v-form @submit.prevent="submit">
        <v-text-field
          v-model="email"
          label="Email"
          type="email"
          autocomplete="email"
          inputmode="email"
          :disabled="busy"
        />
        <v-text-field
          v-model="password"
          label="Password"
          :type="showPassword ? 'text' : 'password'"
          autocomplete="current-password"
          :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
          :disabled="busy"
          @click:append-inner="showPassword = !showPassword"
        />
        <v-btn
          type="submit"
          block
          size="x-large"
          color="primary"
          variant="flat"
          class="mt-6"
          :loading="busy"
        >
          Log in
        </v-btn>
      </v-form>

      <GoogleButton :next="nextPath()" />

      <p class="mt-6">
        New here? <NuxtLink to="/signup">Create an account</NuxtLink>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'app' })
useHead({ title: 'Log in' })

const route = useRoute()
const { session, load, signIn } = useAuth()
load()

// Only allow sending people back to a page inside this app.
function nextPath(): string {
  const next = route.query.next
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')
    ? next
    : '/wallet'
}

if (session.value) {
  await navigateTo(nextPath())
}

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const busy = ref(false)
const error = ref('')

const GOOGLE_ERRORS: Record<string, string> = {
  google_off: 'Google login is not switched on yet.',
  google_cancelled: 'Google login was cancelled.',
  google_email_not_verified: 'Your Google email is not verified, so it cannot be used.',
  google_state: 'The login took too long or was opened in another browser. Please try again.',
  google_exchange: 'Auth0 refused the login. The Auth0 client secret or callback address on the server may be wrong.',
  google_server: 'The server is missing its Supabase service key, so Google login cannot create your session.',
  google_session: 'Google login worked, but Mondo could not start your session.',
}
if (typeof route.query.error === 'string') {
  error.value =
    (GOOGLE_ERRORS[route.query.error] || 'Google login did not work. Please try again.') +
    ` (code: ${route.query.error}${typeof route.query.stage === 'string' ? `, step: ${route.query.stage}, status: ${route.query.status}` : ''})`
}

async function submit() {
  error.value = ''
  if (!email.value.trim() || !password.value) {
    error.value = 'Enter your email and password.'
    return
  }

  busy.value = true
  try {
    await signIn(email.value.trim(), password.value)
    await navigateTo(nextPath())
  } catch (err: any) {
    error.value = errorText(err)
  } finally {
    busy.value = false
  }
}
</script>
