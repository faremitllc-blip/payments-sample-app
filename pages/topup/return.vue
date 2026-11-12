<template>
  <div class="fm-wrap fm-app-main">
    <section class="mo-card mo-ret" role="status" aria-live="polite">
      <template v-if="state === 'checking'">
        <h2>Checking your payment…</h2>
        <p class="my-3 mo-muted">One moment while we confirm it with your bank.</p>
      </template>

      <template v-else-if="state === 'sent'">
        <h2>Payment sent</h2>
        <p class="my-3">
          Your bank has sent your payment{{ amount ? ` of €${amount}` : '' }}. The USDC arrives in your Mondo wallet once the
          transfer lands, usually within minutes.
        </p>
        <v-btn to="/activity" color="primary" variant="flat">See activity</v-btn>
        <v-btn to="/currencies" variant="text" class="ml-2">Back to currencies</v-btn>
      </template>

      <template v-else-if="state === 'stopped'">
        <h2>Payment not completed</h2>
        <p class="my-3">The payment was cancelled or not completed. No money was taken from your bank.</p>
        <v-btn to="/topup/euro" color="primary" variant="flat">Try again</v-btn>
        <v-btn to="/currencies" variant="text" class="ml-2">Back to currencies</v-btn>
      </template>

      <template v-else>
        <h2>Waiting for your bank</h2>
        <p class="my-3">
          Your bank has not confirmed the payment yet. This can take a minute. Check your activity in a little while.
        </p>
        <v-btn to="/activity" color="primary" variant="flat">See activity</v-btn>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'

definePageMeta({ layout: 'dash', middleware: 'auth' })
useHead({ title: 'Payment result' })

const { api } = useAuth()
const route = useRoute()
const state = ref<'checking' | 'sent' | 'stopped' | 'pending'>('checking')
const amount = ref('')
let timer: ReturnType<typeof setTimeout> | null = null

async function check(attempt: number) {
  try {
    const paymentId = typeof route.query.payment_id === 'string' ? route.query.payment_id : ''
    const r = await api<{ status: string; amount: number }>(
      `/api/topup/euro-result${paymentId ? `?payment_id=${encodeURIComponent(paymentId)}` : ''}`,
    )
    if (r.amount) amount.value = r.amount.toFixed(2)
    if (r.status === 'sent') return void (state.value = 'sent')
    if (r.status === 'failed' || r.status === 'cancelled') return void (state.value = 'stopped')
  } catch {
    // A short problem reading the result: try again below.
  }
  // Banks can take a few seconds to confirm. Look again for about 45 seconds.
  if (attempt < 15) {
    timer = setTimeout(() => check(attempt + 1), 3000)
  } else {
    state.value = 'pending'
  }
}

onMounted(() => check(0))
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<style scoped>
.mo-ret { max-width: 560px; padding: 24px; }
</style>
