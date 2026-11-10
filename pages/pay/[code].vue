<template>
  <div class="fm-wrap fm-app-main">
    <div class="mo-pay">
      <div class="mo-pay-brand">
        <span class="mo-pay-logo">M</span>
        <span class="mo-pay-name">Mondo</span>
      </div>

      <v-alert v-if="error" type="error" variant="tonal" class="my-4" role="alert">{{ error }}</v-alert>
      <p v-else-if="loading" role="status" class="mo-muted">Preparing your payment…</p>

      <section v-else-if="d" class="mo-card mo-pay-card" role="status">
        <template v-if="d.status === 'waiting'">
          <p class="fm-balance-label">Top up your Mondo wallet</p>
          <p class="mo-pay-amount">€{{ fmt(d.amount) }}</p>
          <p class="mo-muted my-3">
            You will choose your bank and approve the payment there. Your euros are turned into USDC and
            arrive in your Mondo wallet.
          </p>
          <v-btn :href="d.url" color="primary" variant="flat" size="large" block>Continue to my bank</v-btn>
          <p class="mo-muted mt-3">Taking you to your bank in {{ seconds }} seconds…</p>
          <p class="mo-muted mt-1">Secure payment through open banking. Mondo never sees your bank login.</p>
        </template>

        <template v-else-if="d.status === 'sent'">
          <h2>Payment sent</h2>
          <p class="my-3">Your bank has received your payment of €{{ fmt(d.amount) }}. The USDC arrives in your wallet when the transfer lands.</p>
          <v-btn to="/activity" color="primary" variant="flat">See activity</v-btn>
        </template>

        <template v-else>
          <h2>This payment link is no longer open</h2>
          <p class="my-3">No money was taken. You can start a new top-up.</p>
          <v-btn to="/topup/euro" color="primary" variant="flat">Start a new top-up</v-btn>
        </template>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { errorText, useAuth } from '~/composables/useAuth'

definePageMeta({ layout: 'dash', middleware: 'auth' })
useHead({ title: 'Pay with Mondo' })

interface Link {
  status: string
  amount: number
  url: string
}

const { api } = useAuth()
const route = useRoute()
const loading = ref(true)
const error = ref('')
const d = ref<Link | null>(null)
const seconds = ref(3)
let timer: ReturnType<typeof setInterval> | null = null

function fmt(v: number) {
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

onMounted(async () => {
  try {
    d.value = await api<Link>(`/api/topup/euro-link?code=${encodeURIComponent(String(route.params.code || ''))}`)
    if (d.value.status === 'waiting' && d.value.url) {
      timer = setInterval(() => {
        seconds.value -= 1
        if (seconds.value <= 0) {
          if (timer) clearInterval(timer)
          window.location.href = d.value!.url
        }
      }, 1000)
    }
  } catch (err: any) {
    error.value = errorText(err)
  } finally {
    loading.value = false
  }
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
.mo-pay { max-width: 460px; margin: 0 auto; padding-top: 16px; }
.mo-pay-brand { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
.mo-pay-logo { width: 40px; height: 40px; border-radius: 10px; background: #1e4fd8; color: #fff; font-weight: 700; font-size: 1.3rem; display: inline-flex; align-items: center; justify-content: center; }
.mo-pay-name { font-size: 1.5rem; font-weight: 700; color: #ff4b33; }
.mo-pay-card { padding: 24px; }
.mo-pay-amount { font-size: 2.2rem; font-weight: 700; margin: 4px 0 0; }
</style>
