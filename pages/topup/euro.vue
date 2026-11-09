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
        <v-btn type="submit" color="primary" variant="flat" :loading="busy" :disabled="!validAmount">Continue</v-btn>
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
        <v-btn v-if="url" :href="url" target="_blank" rel="noopener" color="primary" variant="flat" prepend-icon="mdi-open-in-new">
          Open my bank
        </v-btn>
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
const url = ref('')
const topup = ref<Topup | null>(null)
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
    const res = await api<{ id: string; url: string }>('/api/topup/euro-start', {
      method: 'POST',
      body: { amount: Number(amount.value) },
    })
    url.value = res.url
    topup.value = { id: res.id, status: 'waiting', amount: Number(amount.value) }
    // The bank page opens in a new tab so this page can keep watching the payment.
    window.open(res.url, '_blank', 'noopener')
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
  url.value = ''
  error.value = ''
}

onMounted(async () => {
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
</style>
