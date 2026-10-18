<template>
  <v-app class="fm mo" theme="wallet">
    <v-main>
      <div class="mo-shell">
        <nav class="mo-side" aria-label="Main">
          <NuxtLink to="/wallet" class="mo-brand" :aria-label="`${appName} home`">
            <span class="fm-logo-mark" aria-hidden="true"></span>
            <span class="mo-brand-name">{{ appName }}</span>
          </NuxtLink>

          <div class="mo-nav-groups">
            <div class="mo-group">
              <p class="mo-group-title">Main menu</p>
              <NuxtLink
                v-for="item in mainItems"
                :key="item.to"
                :to="item.to"
                class="mo-link"
              >
                <v-icon size="22" aria-hidden="true">{{ item.icon }}</v-icon>
                <span class="mo-link-text">{{ item.label }}</span>
              </NuxtLink>
            </div>

            <div class="mo-group mo-group-account">
              <p class="mo-group-title">Account</p>
              <NuxtLink
                v-for="item in accountItems"
                :key="item.to"
                :to="item.to"
                class="mo-link mo-link-extra"
              >
                <v-icon size="22" aria-hidden="true">{{ item.icon }}</v-icon>
                <span class="mo-link-text">{{ item.label }}</span>
              </NuxtLink>
            </div>
          </div>

          <button type="button" class="mo-link mo-link-out" @click="logOut">
            <v-icon size="22" aria-hidden="true">mdi-logout</v-icon>
            <span class="mo-link-text">Log out</span>
          </button>
        </nav>

        <div class="mo-content">
          <header class="mo-top">
            <p class="mo-title">{{ pageTitle }}</p>
            <div class="mo-top-right">
              <span v-if="mode.loaded && !mode.live" class="mo-test-pill">
                Test mode · test network
              </span>
              <NuxtLink v-if="session" to="/profile" class="mo-user" aria-label="Your profile">
                <span class="mo-avatar" :class="{ 'has-photo': !!photo }">
                  <img v-if="photo" :src="photo" alt="" />
                  <span v-else aria-hidden="true">{{ initial }}</span>
                </span>
                <span class="mo-user-email">{{ shownName }}</span>
              </NuxtLink>
            </div>
          </header>

          <slot />
        </div>
      </div>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { APP_NAME, useAuth } from '~/composables/useAuth'
import { useWallet } from '~/composables/useWallet'

const appName = APP_NAME
useHead({
  titleTemplate: (title) => (title ? `${title} - ${appName}` : appName),
})

const { session, load, signOut } = useAuth()
const { reset } = useWallet()
const { reset: resetBank } = useBank()
const { reset: resetAgent } = useAgent()
const { profile, load: loadProfile, reset: resetProfile } = useProfile()
const { mode, loadMode } = useAppMode()
const route = useRoute()
load()
loadMode()
if (import.meta.client) {
  loadProfile().catch(() => undefined)
}

const mainItems = [
  { to: '/wallet', label: 'Home', icon: 'mdi-home-variant-outline' },
  { to: '/assistant', label: 'Assistant', icon: 'mdi-shimmer' },
  { to: '/send', label: 'Send', icon: 'mdi-arrow-top-right' },
  { to: '/receive', label: 'Receive', icon: 'mdi-arrow-bottom-left' },
  { to: '/bank', label: 'Bank', icon: 'mdi-bank-outline' },
  { to: '/activity', label: 'Activity', icon: 'mdi-receipt-text-outline' },
]

const accountItems = [
  { to: '/profile', label: 'Profile', icon: 'mdi-account-circle-outline' },
  { to: '/kyc', label: 'KYC status', icon: 'mdi-shield-account-outline' },
  { to: '/verify', label: 'Identity check', icon: 'mdi-shield-check-outline' },
  { to: '/developers', label: 'Developer tools', icon: 'mdi-code-tags' },
]

const titles: Record<string, string> = {
  '/wallet': 'Dashboard',
  '/assistant': 'Assistant',
  '/send': 'Send',
  '/receive': 'Receive',
  '/bank': 'Bank accounts',
  '/activity': 'Activity',
  '/profile': 'Profile',
  '/kyc': 'KYC status',
  '/verify': 'Identity check',
  '/developers': 'Developer tools',
}

const pageTitle = computed(() => titles[route.path.replace(/\/$/, '')] || appName)

const photo = computed(() => profile.value?.avatar || '')
const shownName = computed(
  () => profile.value?.displayName || session.value?.email || '',
)
const initial = computed(() =>
  ((shownName.value || '?').charAt(0) || '?').toUpperCase(),
)

async function logOut() {
  await signOut()
  reset()
  resetBank()
  resetAgent()
  resetProfile()
  await navigateTo('/')
}
</script>
