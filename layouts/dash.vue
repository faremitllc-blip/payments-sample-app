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
              <span v-if="session" class="mo-user">
                <span class="mo-avatar" aria-hidden="true">{{ initial }}</span>
                <span class="mo-user-email">{{ session.email }}</span>
              </span>
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
const { mode, loadMode } = useAppMode()
const route = useRoute()
load()
loadMode()

const mainItems = [
  { to: '/wallet', label: 'Home', icon: 'mdi-home-variant-outline' },
  { to: '/assistant', label: 'Assistant', icon: 'mdi-shimmer' },
  { to: '/send', label: 'Send', icon: 'mdi-arrow-top-right' },
  { to: '/receive', label: 'Receive', icon: 'mdi-arrow-bottom-left' },
  { to: '/bank', label: 'Bank', icon: 'mdi-bank-outline' },
  { to: '/activity', label: 'Activity', icon: 'mdi-receipt-text-outline' },
]

const accountItems = [
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
  '/verify': 'Identity check',
  '/developers': 'Developer tools',
}

const pageTitle = computed(() => titles[route.path.replace(/\/$/, '')] || appName)

const initial = computed(() =>
  ((session.value?.email || '?').charAt(0) || '?').toUpperCase(),
)

async function logOut() {
  await signOut()
  reset()
  resetBank()
  resetAgent()
  await navigateTo('/')
}
</script>
