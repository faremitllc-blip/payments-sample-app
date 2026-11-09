<template>
  <div class="fm-wrap fm-app-main">
    <h1 class="fm-page-title">Top up</h1>
    <p class="fm-lede">Choose how you want to add money. It arrives as USDC in your Mondo wallet.</p>

    <div class="mo-top-list">
      <NuxtLink to="/receive" class="mo-card mo-top-item">
        <v-icon icon="mdi-wallet-outline" size="28" />
        <div>
          <strong>1. USDC wallet</strong>
          <p class="mo-muted">Send USDC from another wallet or exchange to your Mondo address.</p>
        </div>
        <v-icon icon="mdi-chevron-right" />
      </NuxtLink>

      <NuxtLink to="/bank" class="mo-card mo-top-item">
        <v-icon icon="mdi-bank-outline" size="28" />
        <div>
          <strong>2. Mondo bank accounts</strong>
          <p class="mo-muted">Send money from your bank to your Mondo account details. It is converted to USDC.</p>
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
