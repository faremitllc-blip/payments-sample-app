<template>
  <div class="fm-wrap fm-app-main">
    <h1 class="fm-page-title">Move funds</h1>
    <p class="fm-lede">
      Move funds between your USDC wallet, your bank accounts and your currency wallets. Balances are shown in each currency at today's rate.
    </p>

    <v-alert v-if="error" type="error" variant="tonal" class="my-4" role="alert">{{ error }}</v-alert>
    <v-alert v-if="done" type="success" variant="tonal" class="my-4" role="status">{{ done }}</v-alert>
    <p v-if="loading" role="status" class="fm-balance-label">Loading…</p>

    <div v-else class="mo-card mo-move">
      <div class="mo-tabs" role="tablist">
        <button type="button" role="tab" :aria-selected="direction === 'in'" :class="{ on: direction === 'in' }" @click="direction = 'in'">Add to currency wallet</button>
        <button type="button" role="tab" :aria-selected="direction === 'out'" :class="{ on: direction === 'out' }" @click="direction = 'out'">Move back to USDC</button>
      </div>

      <template v-if="direction === 'in'">
        <p class="fm-balance-label">From</p>
        <v-radio-group v-model="source" hide-details class="mb-2">
          <v-radio value="usdc" label="USDC wallet" />
          <v-radio value="bank" label="Mondo bank accounts (USD, EUR, GBP)" />
        </v-radio-group>
        <p class="mo-muted mb-3">Available: <strong>{{ fmt(available, 2) }} USDC</strong></p>
      </template>

      <v-select
        v-model="currency"
        :items="items"
        item-title="label"
        item-value="code"
        label="Currency wallet"
        variant="outlined"
        density="comfortable"
        hide-details
        class="mb-2"
      />
      <p class="mo-muted mb-3" v-if="direction === 'out'">
        Balance in your {{ currency }} wallet: <strong>{{ fmt(setAside, 2) }} USDC</strong>
      </p>

      <v-text-field
        v-model="amount"
        label="Amount in USDC"
        inputmode="decimal"
        variant="outlined"
        density="comfortable"
        :hint="preview"
        persistent-hint
        @keyup.enter="submit"
      />

      <div class="mo-actions">
        <v-btn class="mo-grad" variant="flat" :loading="busy" :disabled="!canSubmit" @click="submit">
          {{ direction === 'in' ? 'Move funds' : 'Move back to USDC' }}
        </v-btn>
        <v-btn v-if="direction === 'out' && setAside > 0" variant="outlined" @click="amount = String(Number(setAside.toFixed(6)))">Move all</v-btn>
        <v-btn variant="text" to="/currencies">Back to currencies</v-btn>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CURRENCIES } from '~/utils/currencies'
import { errorText, useAuth } from '~/composables/useAuth'
import { useWallet } from '~/composables/useWallet'

definePageMeta({ layout: 'dash', middleware: 'auth' })
useHead({ title: 'Move funds' })

const route = useRoute()
const { api } = useAuth()
const { wallet, usdc, loadWallet, loadBalance } = useWallet()

const loading = ref(true)
const busy = ref(false)
const error = ref('')
const done = ref('')
const direction = ref<'in' | 'out'>('in')
const source = ref<'usdc' | 'bank'>(route.query.source === 'bank' ? 'bank' : 'usdc')
const currency = ref(
  CURRENCIES.some((c) => c.code === String(route.query.currency)) ? String(route.query.currency) : 'EUR',
)
const amount = ref('')
const pockets = ref<Record<string, number>>({})
const rates = ref<Record<string, number>>({})

const items = CURRENCIES.map((c) => ({ code: c.code, label: `${c.code} · ${c.name}` }))
const total = computed(() => Number(usdc.value) || 0)
const setAsideAll = computed(() => Object.values(pockets.value).reduce((a, b) => a + b, 0))
const available = computed(() => Math.max(0, total.value - setAsideAll.value))
const setAside = computed(() => pockets.value[currency.value] || 0)
watch(direction, (d) => {
  error.value = ''
  done.value = ''
  if (d === 'out' && !pockets.value[currency.value]) {
    const first = Object.keys(pockets.value).find((k) => pockets.value[k] > 0)
    if (first) currency.value = first
  }
})
const info = computed(() => CURRENCIES.find((c) => c.code === currency.value))

const value = computed(() => Number(amount.value))
const canSubmit = computed(() => /^\d{1,9}(\.\d{1,6})?$/.test(amount.value.trim()) && value.value > 0)
const preview = computed(() => {
  const r = rates.value[currency.value]
  if (!canSubmit.value || !r || !info.value) return ''
  return `About ${fmt(value.value * r, info.value.decimals)} ${currency.value} at today's rate`
})

function fmt(v: number, digits: number) {
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

async function load() {
  const [p, r] = await Promise.all([
    api<{ pockets: Record<string, number> }>('/api/pockets'),
    api<{ rates: Record<string, number> }>('/api/rates'),
  ])
  pockets.value = p.pockets
  rates.value = r.rates
}

async function submit() {
  if (!canSubmit.value || busy.value) return
  busy.value = true
  error.value = ''
  done.value = ''
  try {
    await api('/api/pockets/move', {
      method: 'POST',
      body: { currency: currency.value, amount: amount.value.trim(), direction: direction.value, source: source.value },
    })
    done.value =
      direction.value === 'in'
        ? `${amount.value.trim()} USDC moved to your ${currency.value} wallet.`
        : `${amount.value.trim()} USDC moved back to your USDC wallet.`
    amount.value = ''
    await load()
  } catch (err: any) {
    error.value = errorText(err)
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  try {
    await loadWallet()
    await Promise.all([wallet.value ? loadBalance() : Promise.resolve(), load()])
  } catch (err: any) {
    error.value = errorText(err)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.mo-move { max-width: 560px; padding: 20px; }
.mo-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
.mo-tabs button {
  padding: 12px 10px; border-radius: 12px; font-weight: 600; cursor: pointer;
  border: 1.5px solid var(--fm-line); background: transparent; color: var(--fm-ink);
}
.mo-tabs button.on { border-color: transparent; color: #fff; background: linear-gradient(135deg, #2554e8 0%, #ff4b33 100%); box-shadow: 0 4px 14px rgba(37, 84, 232, 0.25); }
.mo-tabs button:focus-visible { outline: 3px solid #a8e4ee; outline-offset: 2px; }
.mo-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 20px; align-items: center; }
.mo-grad.v-btn { background: linear-gradient(135deg, #2554e8 0%, #ff4b33 100%) !important; color: #fff !important; }
.mo-grad.v-btn--disabled { opacity: 0.45; }
</style>
