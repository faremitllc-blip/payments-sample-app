<template>
  <div class="fm-wrap fm-app-main">
    <h1 class="fm-page-title">Currencies</h1>

    <v-alert v-if="error" type="error" variant="tonal" class="my-4" role="alert">{{ error }}</v-alert>
    <p v-if="loading" role="status" class="fm-balance-label">Loading…</p>

    <template v-else>
      <section class="mo-card mt-4">
        <div class="mo-cur-head">
          <span class="mo-cur-coin-wrap"><span class="mo-cur-coin"><img src="/usdc-coin.png" alt="USDC" class="mo-face" width="64" height="64" /><img src="/usdc-coin.png" alt="" aria-hidden="true" class="mo-face mo-back" width="64" height="64" /></span></span>
          <div>
            <p class="fm-balance-label">Your USDC balance</p>
            <p class="mo-cur-total">{{ fmt(balance, 2) }} USDC</p>
          </div>
          <v-btn to="/topup" color="primary" variant="flat" class="ml-auto" prepend-icon="mdi-plus">Top up</v-btn>
        </div>
        <p v-if="rates" class="mo-muted">
          Rates from Frankfurter (central banks and official sources), for {{ updated }}. They update once a day. 1 USDC is treated as 1 US dollar.
        </p>
        <v-btn v-if="rates" size="small" variant="tonal" class="mt-2" :loading="refreshing" @click="refresh">
          Refresh rates
        </v-btn>
      </section>

      <template v-if="rates">
        <section v-for="g in groups" :key="g.title" class="mt-6">
          <h2>{{ g.title }}</h2>
          <div class="mo-cur-grid mt-3">
            <div v-for="c in g.items" :key="c.code" class="mo-card mo-cur-card">
              <div class="mo-cur-top">
                <FlagIcon :code="c.code" :size="36" />
                <div class="mo-cur-name">
                  <strong>{{ c.code }}</strong>
                  <span class="mo-muted">{{ c.name }}</span>
                </div>
              </div>
              <p v-if="rates.rates[c.code]" class="mo-cur-amount">
                {{ fmt(balance * rates.rates[c.code], c.decimals) }}
                <span>{{ c.code }}</span>
              </p>
              <p v-else class="mo-muted mo-cur-amount">Rate not available</p>
              <p v-if="rates.rates[c.code]" class="mo-muted mo-cur-rate">
                1 USDC = {{ fmt(rates.rates[c.code], rateDigits(rates.rates[c.code])) }} {{ c.code }}
              </p>
            </div>
          </div>
        </section>
        <p class="mo-muted mt-6">
          Reference rates, for information only. Banks and money transfer services
          charge their own rates and fees.
        </p>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { CURRENCIES } from '~/utils/currencies'
import { errorText, useAuth } from '~/composables/useAuth'
import { useWallet } from '~/composables/useWallet'

definePageMeta({ layout: 'dash', middleware: 'auth' })
useHead({ title: 'Currencies' })

const { api } = useAuth()
const { wallet, usdc, loadWallet, loadBalance } = useWallet()

const loading = ref(true)
const refreshing = ref(false)
const error = ref('')
const rates = ref<{ updatedAt: string; rates: Record<string, number> } | null>(null)

const balance = computed(() => Number(usdc.value) || 0)
const groups = computed(() => [
  { title: 'African currencies', items: CURRENCIES.filter((c) => c.region === 'africa') },
  { title: 'International currencies', items: CURRENCIES.filter((c) => c.region === 'world') },
])
const updated = computed(() => {
  if (!rates.value) return ''
  const d = new Date(rates.value.updatedAt)
  return Number.isNaN(d.getTime()) ? rates.value.updatedAt : d.toLocaleDateString(undefined, { dateStyle: 'medium' })
})

function fmt(v: number, digits: number) {
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
function rateDigits(rate: number) {
  return rate >= 100 ? 2 : 4
}

async function loadRates() {
  rates.value = await api('/api/rates')
}
async function refresh() {
  refreshing.value = true
  try {
    await Promise.all([loadBalance(), loadRates()])
  } catch (err: any) {
    error.value = errorText(err)
  } finally {
    refreshing.value = false
  }
}

onMounted(async () => {
  try {
    await loadWallet()
    // The balance and the rates load at the same time. A missing wallet just shows 0.
    await Promise.all([wallet.value ? loadBalance() : Promise.resolve(), loadRates()])
  } catch (err: any) {
    error.value = errorText(err)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.mo-cur-head { display: flex; align-items: center; gap: 16px; }
/* A half turn (180 degrees), then 10 seconds still. The coin has the same picture on both
   faces, so after the half turn it looks the same and the loop restarts without a jump. */
.mo-cur-coin-wrap { flex: 0 0 auto; perspective: 500px; display: inline-block; }
.mo-cur-coin { position: relative; display: block; width: 64px; height: 64px; transform-style: preserve-3d; animation: mo-coin-flip 11.6s cubic-bezier(0.45, 0, 0.25, 1) infinite; }
.mo-face { position: absolute; inset: 0; width: 64px; height: 64px; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.mo-back { transform: rotateY(180deg); }
@keyframes mo-coin-flip {
  0% { transform: rotateY(0deg); }
  8.6% { transform: rotateY(180deg); }
  100% { transform: rotateY(180deg); }
  /* the loop restarts from 0deg, which looks identical to 180deg */
}
@media (prefers-reduced-motion: reduce) {
  .mo-cur-coin, .mo-cur-coin-wrap { animation: none; }
}
.mo-cur-total { font-size: 1.8rem; font-weight: 700; margin: 4px 0 8px; }
.mo-cur-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.mo-cur-card { padding: 16px; }
.mo-cur-top { display: flex; gap: 12px; align-items: center; }
.mo-cur-name { display: flex; flex-direction: column; min-width: 0; }
.mo-cur-name span { font-size: 0.8rem; }
.mo-cur-amount { font-size: 1.3rem; font-weight: 600; margin: 10px 0 4px; word-break: break-word; }
.mo-cur-amount span { font-size: 0.85rem; font-weight: 500; opacity: 0.7; }
.mo-cur-rate { font-size: 0.8rem; margin: 0; }
</style>
