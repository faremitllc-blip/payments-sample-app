<template>
  <div class="fm-wrap fm-app-main">
    <h1 class="fm-page-title">Move funds</h1>
    <p class="fm-lede">
      Set aside USDC in a currency wallet. Your money stays in Mondo and is shown in that currency at today's rate.
      Set-aside USDC cannot be sent or invested until you move it back.
    </p>

    <v-alert v-if="error" type="error" variant="tonal" class="my-4" role="alert">{{ error }}</v-alert>
    <v-alert v-if="done" type="success" variant="tonal" class="my-4" role="status">{{ done }}</v-alert>
    <p v-if="loading" role="status" class="fm-balance-label">Loading…</p>

    <div v-else class="mo-card mo-move">
      <v-btn-toggle v-model="direction" mandatory divided density="comfortable" color="primary" class="mb-4">
        <v-btn value="in">Add to currency wallet</v-btn>
        <v-btn value="out">Move back to USDC</v-btn>
      </v-btn-toggle>

      <template v-if="direction === 'in'">
        <p class="fm-balance-label">From</p>
        <v-radio-group v-model="source" hide-details class="mb-2">
          <v-radio value="usdc" label="USDC wallet" />
          <v-radio value="bank" label="Mondo bank accounts (USD, EUR, GBP)" />
        </v-radio-group>
        <p v-if="source === 'bank'" class="mo-muted">
          Money that reaches your bank accounts arrives in your wallet as USDC, so this uses the same available balance.
        </p>
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
        Set aside in {{ currency }}: <strong>{{ fmt(setAside, 2) }} USDC</strong>
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

      <v-btn color="primary" variant="flat" class="mt-4" :loading="busy" :disabled="!canSubmit" @click="submit">
        {{ direction === 'in' ? 'Set aside' : 'Move back' }}
      </v-btn>
      <v-btn variant="text" class="mt-4 ml-2" to="/currencies">Back to currencies</v-btn>
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
        ? `${amount.value.trim()} USDC is now set aside in your ${currency.value} wallet.`
        : `${amount.value.trim()} USDC was moved back from your ${currency.value} wallet.`
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
</style>
