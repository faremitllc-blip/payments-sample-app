<template>
  <div class="fm-wrap fm-app-main">
    <h1 class="fm-page-title">Top up</h1>
    <p class="fm-lede">Choose where the money comes from to fill your currency wallets.</p>

    <div class="mo-top-list">
      <NuxtLink :to="moveLink('usdc')" class="mo-card mo-top-item">
        <v-icon icon="mdi-wallet-outline" size="28" />
        <div>
          <strong>1. USDC wallet</strong>
          <p class="mo-muted">Move USDC from your Mondo wallet into a currency wallet.</p>
        </div>
        <v-icon icon="mdi-chevron-right" />
      </NuxtLink>

      <NuxtLink :to="moveLink('bank')" class="mo-card mo-top-item">
        <v-icon icon="mdi-bank-outline" size="28" />
        <div>
          <strong>2. Mondo bank accounts</strong>
          <p class="mo-muted">Move money received in your USD, EUR or GBP bank accounts into a currency wallet.</p>
        </div>
        <v-icon icon="mdi-chevron-right" />
      </NuxtLink>

      <NuxtLink v-if="euroOpen" to="/topup/euro" class="mo-card mo-top-item">
        <v-icon icon="mdi-bank-transfer" size="28" />
        <div>
          <strong>3. Open banking (EUR)</strong>
          <p class="mo-muted">Pay in euros straight from your bank app. No card needed.</p>
        </div>
        <v-icon icon="mdi-chevron-right" />
      </NuxtLink>
      <div v-else class="mo-card mo-top-item mo-top-off" aria-disabled="true">
        <v-icon icon="mdi-bank-transfer" size="28" />
        <div>
          <strong>3. Open banking (EUR)</strong>
          <p class="mo-muted">Coming soon.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dash', middleware: 'auth' })
useHead({ title: 'Top up' })

const route = useRoute()
// Keeps the chosen currency when coming from a currency card.
const moveLink = (source: string) => ({
  path: '/topup/move',
  query: { source, ...(route.query.currency ? { currency: String(route.query.currency) } : {}) },
})

// Open banking (EUR) is connected.
const euroOpen = true
</script>

<style scoped>
.mo-top-list { display: grid; gap: 12px; max-width: 640px; }
.mo-top-item { display: flex; align-items: center; gap: 16px; padding: 18px; color: inherit; text-decoration: none; }
.mo-top-item > div { flex: 1; min-width: 0; }
.mo-top-item p { margin: 4px 0 0; }
.mo-top-off { opacity: 0.55; }
</style>
