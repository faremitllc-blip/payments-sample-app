<template>
  <div class="fm-wrap fm-app-main mo-ach">
    <h1 class="fm-page-title">Top up from a US bank</h1>
    <p class="fm-lede">
      Pay in US dollars from your own US checking or savings account by ACH. The USDC arrives in your Mondo wallet.
    </p>

    <v-alert v-if="error" type="error" variant="tonal" class="my-4" role="alert">{{ error }}</v-alert>
    <p v-if="loading" role="status" class="mo-muted">Loading…</p>

    <v-alert v-else-if="!state?.configured" type="info" variant="tonal" class="my-4">
      Bank (ACH) top-ups are not switched on yet.
    </v-alert>

    <template v-else>
      <v-alert v-if="state.sandbox" type="warning" variant="tonal" class="my-4">
        Test mode: no real money moves. Use the test bank offered on the bank page.
      </v-alert>

      <!-- Active top-up -->
      <section v-if="topup" class="mo-card mo-box" role="status">
        <template v-if="topup.status === 'waiting'">
          <h2>Your bank payment is in progress</h2>
          <p class="mo-muted my-3">
            ${{ fmt(topup.amount) }} is being collected from your bank by ACH. Bank transfers usually take 1 to 3 working days.
            The USDC is sent to your wallet when the money arrives. You can leave this page.
          </p>
          <p class="mo-muted">Step: {{ topup.step || 'starting' }}<span v-if="topup.subStep"> ({{ topup.subStep }})</span></p>
          <div v-if="state.sandbox" class="mo-actions">
            <v-btn variant="outlined" :loading="simBusy" @click="simulate('settled')">Test: bank confirmed</v-btn>
            <v-btn variant="outlined" :loading="simBusy" @click="simulate('completed')">Test: finish</v-btn>
          </div>
        </template>
        <template v-else-if="topup.status === 'credited'">
          <h2>Top-up complete</h2>
          <p class="my-3">
            {{ topup.usdc ? `${fmt(topup.usdc)} USDC has been sent to your Mondo wallet.` : 'Your USDC has been sent to your Mondo wallet.' }}
          </p>
          <v-btn to="/wallet" color="primary" variant="flat">Go to my wallet</v-btn>
        </template>
        <template v-else>
          <h2>{{ topup.status === 'cancelled' ? 'Top-up cancelled' : 'Top-up not completed' }}</h2>
          <p class="my-3">{{ topup.error || 'No money was kept from your bank.' }}</p>
          <v-btn color="primary" variant="flat" @click="reset">Try again</v-btn>
        </template>
      </section>

      <!-- Step 1: profile -->
      <section v-else-if="!state.customer" class="mo-card mo-box">
        <h2>1. Your details</h2>
        <p class="mo-muted my-2">We need these once, to check your identity. Enter them as they appear on your ID.</p>
        <v-form @submit.prevent="createProfile">
          <v-text-field v-model="form.firstName" label="First name" variant="outlined" density="comfortable" autocomplete="given-name" />
          <v-text-field v-model="form.lastName" label="Last name" variant="outlined" density="comfortable" autocomplete="family-name" />
          <v-text-field v-model="form.birthDate" label="Date of birth (YYYY-MM-DD)" variant="outlined" density="comfortable" placeholder="1990-04-15" />
          <v-text-field v-model="form.phone" label="US phone number" variant="outlined" density="comfortable" placeholder="555-555-1234" inputmode="tel" autocomplete="tel" />
          <v-btn type="submit" color="primary" variant="flat" :loading="busy">Continue</v-btn>
        </v-form>
        <p class="mo-muted mt-4">US bank accounts only. Your details are used for the identity check and nothing else.</p>
      </section>

      <!-- Step 2: identity -->
      <section v-else-if="!state.customer.verified" class="mo-card mo-box">
        <h2>2. Verify your identity</h2>
        <template v-if="state.customer.status === 'rejected' || state.customer.status === 'declined'">
          <p class="my-3">
            The identity check did not pass ({{ state.customer.state || state.customer.status }}). Please contact support.
          </p>
        </template>
        <template v-else>
          <p class="mo-muted my-3">
            Accept the service agreement, then complete the identity check. It takes a few minutes and needs your camera.
            When you finish, come back and tap "Check again".
          </p>
          <div class="mo-actions">
            <v-btn v-if="state.customer.agreementLink" :href="state.customer.agreementLink" target="_blank" rel="noopener" variant="outlined">
              1. Accept agreement
            </v-btn>
            <v-btn v-if="state.customer.verificationLink" :href="state.customer.verificationLink" target="_blank" rel="noopener" variant="outlined">
              2. Verify identity
            </v-btn>
            <v-btn color="primary" variant="flat" :loading="busy" @click="refresh">Check again</v-btn>
          </div>
          <p class="mo-muted mt-3">Status: {{ state.customer.status }}{{ state.customer.state ? ` (${state.customer.state})` : '' }}</p>
        </template>
      </section>

      <!-- Step 3: link a bank -->
      <section v-else-if="!state.banks.length" class="mo-card mo-box">
        <h2>3. Link your bank</h2>
        <p class="mo-muted my-3">Connect your US checking or savings account once. You can use it for every top-up.</p>
        <v-btn class="mo-grad" variant="flat" :loading="busy" @click="linkBank">Link bank account</v-btn>
        <v-btn variant="text" class="ml-2" @click="refresh">I linked it</v-btn>
      </section>

      <!-- Step 4: amount -->
      <section v-else class="mo-card mo-box">
        <h2>Top up</h2>
        <v-text-field v-model="amount" label="Amount in US dollars" prefix="$" inputmode="decimal" variant="outlined" density="comfortable" />
        <v-select
          v-model="bankId"
          :items="bankItems"
          item-title="label"
          item-value="id"
          label="From"
          variant="outlined"
          density="comfortable"
        />
        <div class="mo-actions">
          <v-btn class="mo-grad" variant="flat" :loading="busy" :disabled="!canStart" @click="start">Continue</v-btn>
          <v-btn variant="text" :loading="busy" @click="linkBank">Link another bank</v-btn>
        </div>
        <p class="mo-muted mt-3">You approve the transfer by email before your bank is charged.</p>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { errorText, useAuth } from '~/composables/useAuth'

definePageMeta({ layout: 'dash', middleware: 'auth' })
useHead({ title: 'Top up from a US bank' })

interface Bank { id: string; name: string; type: string; last4: string; institution: string; connected: boolean }
interface State {
  configured: boolean
  sandbox?: boolean
  customer?: { status: string; state: string; verified: boolean; agreementLink: string; verificationLink: string } | null
  banks: Bank[]
}
interface Topup { id: string; status: string; amount: number; usdc?: number | null; error?: string | null; step?: string; subStep?: string }

const { api } = useAuth()
const route = useRoute()
const state = ref<State | null>(null)
const loading = ref(true)
const busy = ref(false)
const simBusy = ref(false)
const error = ref('')
const amount = ref('')
const bankId = ref('')
const topup = ref<Topup | null>(null)
const form = reactive({ firstName: '', lastName: '', birthDate: '', phone: '' })
let timer: ReturnType<typeof setInterval> | null = null

const bankItems = computed(() =>
  (state.value?.banks || [])
    .filter((b) => b.connected)
    .map((b) => ({ id: b.id, label: `${b.institution || b.name} ${b.type ? b.type.toLowerCase() : ''} ••${b.last4}`.replace(/\s+/g, ' ').trim() })),
)
const canStart = computed(() => Number(amount.value) >= 1 && !!bankId.value)
const fmt = (v: number) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function refresh() {
  error.value = ''
  busy.value = true
  try {
    state.value = await api<State>('/api/ach/state')
    if (!bankId.value && state.value.banks.length) bankId.value = state.value.banks.find((b) => b.connected)?.id || ''
  } catch (err: any) {
    error.value = errorText(err)
  } finally {
    busy.value = false
    loading.value = false
  }
}

async function createProfile() {
  error.value = ''
  busy.value = true
  try {
    await api('/api/ach/customer', { method: 'POST', body: { ...form } })
    await refresh()
  } catch (err: any) {
    error.value = errorText(err)
    busy.value = false
  }
}

async function linkBank() {
  error.value = ''
  busy.value = true
  try {
    const r = await api<{ url: string }>('/api/ach/link', { method: 'POST' })
    window.location.href = r.url
  } catch (err: any) {
    error.value = errorText(err)
    busy.value = false
  }
}

function stop() {
  if (timer) clearInterval(timer)
  timer = null
}

async function check(id: string) {
  try {
    const r = await api<Omit<Topup, 'id'>>(`/api/ach/result?id=${encodeURIComponent(id)}`)
    topup.value = { id, ...r }
    if (r.status !== 'waiting') stop()
  } catch (err: any) {
    console.error(errorText(err))
  }
}

function watch(id: string) {
  stop()
  timer = setInterval(() => check(id), 6000)
}

async function start() {
  error.value = ''
  busy.value = true
  try {
    const r = await api<{ id: string }>('/api/ach/start', { method: 'POST', body: { amount: Number(amount.value), bankId: bankId.value } })
    topup.value = { id: r.id, status: 'waiting', amount: Number(amount.value) }
    history.replaceState(null, '', `/topup/ach?id=${r.id}`)
    watch(r.id)
    check(r.id)
  } catch (err: any) {
    error.value = errorText(err)
  } finally {
    busy.value = false
  }
}

async function simulate(step: 'settled' | 'completed') {
  if (!topup.value) return
  error.value = ''
  simBusy.value = true
  try {
    await api('/api/ach/simulate', { method: 'POST', body: { id: topup.value.id, step } })
    await check(topup.value.id)
  } catch (err: any) {
    error.value = errorText(err)
  } finally {
    simBusy.value = false
  }
}

function reset() {
  stop()
  topup.value = null
  history.replaceState(null, '', '/topup/ach')
}

onMounted(async () => {
  await refresh()
  const id = String(route.query.id || '')
  if (/^[0-9a-f-]{36}$/i.test(id)) {
    await check(id)
    if (topup.value?.status === 'waiting') watch(id)
  }
})
onBeforeUnmount(stop)
</script>

<style scoped>
.mo-ach { max-width: 640px; padding-bottom: 48px; }
.mo-box { padding: 20px; margin: 14px 0; }
.mo-actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-top: 12px; }
.mo-grad.v-btn { background: linear-gradient(135deg, #2554e8 0%, #ff4b33 100%) !important; color: #fff !important; }
</style>
