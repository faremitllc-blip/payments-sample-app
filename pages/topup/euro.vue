<template>
  <div class="fm-wrap fm-app-main">
    <h1 class="fm-page-title">Top up with open banking</h1>
    <p class="fm-lede">
      Pay in euros from your own bank app. The money goes to your Mondo EUR
      account and is turned into USDC in your wallet.
    </p>

    <v-alert v-if="error" type="error" variant="tonal" class="my-4" role="alert">{{ error }}</v-alert>

    <!-- Step 1: amount -->
    <section v-if="!topup" class="mo-card mo-eu-box">
      <v-form @submit.prevent="start">
        <v-text-field
          v-model="amount"
          label="Amount in euros"
          prefix="€"
          inputmode="decimal"
          hint="You approve the payment in your bank app. Nothing is taken without your approval."
          persistent-hint
          class="mb-4"
        />

        <div class="mo-banks">
          <div class="mo-banks-head">
            <strong>Your bank</strong>
            <v-select
              v-model="country"
              :items="countryItems"
              item-title="title"
              item-value="value"
              density="compact"
              variant="outlined"
              hide-details
              class="mo-country"
              aria-label="Country"
              @update:model-value="loadBanks"
            />
          </div>

          <p v-if="loadingBanks" class="mo-muted">Loading banks…</p>
          <p v-else-if="!country" class="mo-muted">Choose the country where your bank is, then pick your bank.</p>
          <template v-else-if="allBanks.length">
            <div v-if="topBanks.length && !query.trim()" class="mo-bank-grid">
              <button
                v-for="b in topBanks"
                :key="b.code"
                type="button"
                class="mo-bank"
                :class="{ on: provider === b.code }"
                @click="pick(b.code)"
              >
                <img v-if="b.logo" :src="b.logo" alt="" loading="lazy" />
                <span>{{ b.name }}</span>
              </button>
            </div>
            <v-text-field
              v-model="query"
              label="Search for another bank"
              prepend-inner-icon="mdi-magnify"
              density="compact"
              variant="outlined"
              hide-details
              clearable
              class="mt-3"
            />
            <div v-if="query.trim()" class="mo-bank-list" role="listbox" aria-label="Banks">
              <button
                v-for="b in found"
                :key="b.code"
                type="button"
                class="mo-bank-row"
                :class="{ on: provider === b.code }"
                role="option"
                :aria-selected="provider === b.code"
                @click="pick(b.code)"
              >
                <img v-if="b.logo" :src="b.logo" alt="" loading="lazy" />
                <span>{{ b.name }}</span>
              </button>
              <p v-if="!found.length" class="mo-muted pa-2">No bank found. You can also choose it on the next page.</p>
            </div>
            <p v-if="chosenName" class="mo-muted mt-2">Paying from <strong>{{ chosenName }}</strong></p>
          </template>
          <p v-else class="mo-muted">
            You will choose your bank on the next page.
            <span v-if="seen" class="mo-diag">({{ seen }})</span>
          </p>
        </div>

        <v-btn type="submit" color="primary" variant="flat" :loading="busy" :disabled="!validAmount || needsBank" class="mt-4">Continue</v-btn>
        <p v-if="needsBank && validAmount" class="mo-muted mt-2">Pick your bank above to continue.</p>
      </v-form>
      <p class="mo-muted mt-4">
        You need a EUR account on the <NuxtLink to="/bank">Bank page</NuxtLink> first.
      </p>
    </section>

    <!-- Step 2: pay at the bank, then wait -->
    <section v-else class="mo-card mo-eu-box" role="status">
      <template v-if="topup.status === 'waiting'">
        <h2>Approve the payment of €{{ fmt(topup.amount) }}</h2>
        <p class="mo-muted my-3">
          Open the bank page, choose your bank and approve the payment there. Keep this page open.
          The link works for about 20 minutes.
        </p>
        <v-btn v-if="code" :href="`/pay/${code}`" target="_blank" rel="noopener" color="primary" variant="flat" prepend-icon="mdi-open-in-new">
          Open my bank
        </v-btn>
        <p v-if="code" class="mo-muted mt-3">
          Your payment link: <strong>{{ payLink }}</strong>
          <v-btn size="x-small" variant="text" @click="copyLink">{{ copied ? 'Copied' : 'Copy' }}</v-btn>
        </p>
        <p class="mo-muted mt-4">Waiting for your bank…</p>
      </template>

      <template v-else-if="topup.status === 'sent'">
        <h2>Payment sent</h2>
        <p class="my-3">
          Your bank has received your payment of €{{ fmt(topup.amount) }}. The USDC arrives in your
          wallet when the transfer lands, usually within minutes and at most one working day.
        </p>
        <div class="d-flex ga-2 flex-wrap">
          <v-btn to="/activity" color="primary" variant="flat">See activity</v-btn>
          <v-btn to="/currencies" variant="tonal">Back to currencies</v-btn>
        </div>
      </template>

      <template v-else>
        <h2>{{ topup.status === 'cancelled' ? 'Payment cancelled' : 'Payment not completed' }}</h2>
        <p class="my-3">{{ topup.error || 'No money was taken from your bank.' }}</p>
        <v-btn color="primary" variant="flat" @click="reset">Try again</v-btn>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import { errorText, useAuth } from '~/composables/useAuth'

definePageMeta({ layout: 'dash', middleware: 'auth' })
useHead({ title: 'Top up with open banking' })

interface Topup {
  id: string
  status: 'waiting' | 'sent' | 'failed' | 'cancelled'
  amount: number
  error?: string | null
}

const { api } = useAuth()
const route = useRoute()
const amount = ref('')
const busy = ref(false)
const error = ref('')
const code = ref('')
const copied = ref(false)
const payLink = computed(() => (import.meta.client ? `${window.location.origin}/pay/${code.value}` : ''))
const topup = ref<Topup | null>(null)

interface Bank {
  code: string
  name: string
  logo: string
}
const country = ref('')
const allBanks = ref<Bank[]>([])
const topBanks = ref<Bank[]>([])
const provider = ref('')
const query = ref('')
const loadingBanks = ref(false)
const seen = ref('')

// Countries that can pay in euros, named in the customer's own language.
const SEPA = 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE NO IS LI'.split(' ')
const countryItems = computed(() => {
  let names: Intl.DisplayNames | null = null
  try {
    names = new Intl.DisplayNames([navigator.language || 'en'], { type: 'region' })
  } catch {
    names = null
  }
  const items = SEPA.map((c) => ({ value: c, title: names?.of(c) || c }))
  items.sort((a, b) => a.title.localeCompare(b.title))
  return items
})
const found = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? allBanks.value.filter((b) => b.name.toLowerCase().includes(q)).slice(0, 30) : []
})
// With a bank list on screen, the customer must pick a bank, so the next page never opens empty.
const needsBank = computed(() => allBanks.value.length > 0 && !provider.value)
const chosenName = computed(() => allBanks.value.find((b) => b.code === provider.value)?.name || '')

function pick(code: string) {
  provider.value = provider.value === code ? '' : code
}

async function loadBanks() {
  loadingBanks.value = true
  provider.value = ''
  query.value = ''
  try {
    const r = await api<{ country: string; banks: Bank[]; top: Bank[]; seen?: { total: number; templates: Record<string, number> } }>(
      `/api/topup/banks${country.value ? `?country=${encodeURIComponent(country.value)}` : ''}`,
    )
    if (r.country && SEPA.includes(r.country)) country.value = r.country
    allBanks.value = r.banks || []
    topBanks.value = r.top || []
    seen.value = r.seen
      ? `${r.country}: ${r.seen.total} banks listed by the provider; payment types ${Object.entries(r.seen.templates).map(([k, v]) => `${k}×${v}`).join(', ') || 'none'}`
      : ''
  } catch {
    allBanks.value = []
    topBanks.value = []
  } finally {
    loadingBanks.value = false
  }
}
let timer: ReturnType<typeof setInterval> | null = null

const validAmount = computed(() => {
  const n = Number(amount.value)
  return Number.isFinite(n) && n >= 1
})

function fmt(v: number) {
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function stopPolling() {
  if (timer) clearInterval(timer)
  timer = null
}

async function refresh(id: string) {
  try {
    const res = await api<Topup>(`/api/topup/euro-status?id=${encodeURIComponent(id)}`)
    topup.value = res
    if (res.status !== 'waiting') stopPolling()
  } catch (err: any) {
    // Keep waiting; a short network problem should not end the top-up.
    console.error(errorText(err))
  }
}

function poll(id: string) {
  stopPolling()
  timer = setInterval(() => refresh(id), 4000)
}

async function start() {
  error.value = ''
  busy.value = true
  try {
    const res = await api<{ id: string; code: string }>('/api/topup/euro-start', {
      method: 'POST',
      body: {
        amount: Number(amount.value),
        ...(provider.value ? { provider: provider.value } : {}),
        ...(country.value ? { country: country.value } : {}),
      },
    })
    code.value = res.code
    topup.value = { id: res.id, status: 'waiting', amount: Number(amount.value) }
    // The Mondo payment page opens in a new tab so this page can keep watching the payment.
    window.open(`/pay/${res.code}`, '_blank', 'noopener')
    poll(res.id)
  } catch (err: any) {
    error.value = errorText(err)
  } finally {
    busy.value = false
  }
}

function reset() {
  stopPolling()
  topup.value = null
  code.value = ''
  error.value = ''
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(payLink.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    // Copying is a convenience only.
  }
}

onMounted(async () => {
  loadBanks()
  const id = String(route.query.id || '')
  if (/^[0-9a-f-]{36}$/i.test(id)) {
    await refresh(id)
    if (topup.value?.status === 'waiting') poll(id)
  }
})
onBeforeUnmount(stopPolling)
</script>

<style scoped>
.mo-eu-box { max-width: 560px; padding: 20px; }
.mo-diag { font-size: 0.75rem; opacity: 0.7; }
.mo-banks { margin: 4px 0 8px; }
.mo-banks-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.mo-country { max-width: 220px; }
.mo-bank-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
@media (max-width: 480px) { .mo-bank-grid { grid-template-columns: 1fr; } .mo-banks-head { flex-wrap: wrap; } .mo-country { max-width: none; width: 100%; } }
.mo-bank, .mo-bank-row {
  display: flex; align-items: center; gap: 10px; text-align: left; cursor: pointer;
  padding: 10px 12px; border: 1px solid rgba(128, 128, 128, 0.35); border-radius: 12px;
  background: transparent; color: inherit; font: inherit; min-height: 48px;
}
.mo-bank:hover, .mo-bank-row:hover { border-color: #2554e8; }
.mo-bank.on, .mo-bank-row.on { border-color: #2554e8; box-shadow: 0 0 0 2px rgba(37, 84, 232, 0.25); }
.mo-bank img, .mo-bank-row img { width: 28px; height: 28px; object-fit: contain; border-radius: 6px; flex: none; }
.mo-bank-list { max-height: 260px; overflow-y: auto; margin-top: 8px; display: grid; gap: 6px; }
</style>
