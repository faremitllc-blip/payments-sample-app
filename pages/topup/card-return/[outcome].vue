<template>
  <div class="fm-wrap fm-app-main">
    <section class="mo-card mo-ret" role="status" aria-live="polite">
      <template v-if="state === 'checking'">
        <h2>Checking your payment…</h2>
        <p class="my-3 mo-muted">One moment while we confirm it.</p>
      </template>

      <template v-else-if="state === 'credited'">
        <h2>Payment received</h2>
        <p class="my-3">
          Your card payment{{ amount ? ` of €${amount}` : '' }} went through.
          {{ usdc ? `${usdc} USDC has been sent to your Mondo wallet.` : 'Your USDC has been sent to your Mondo wallet.' }}
        </p>
        <v-btn to="/wallet" color="primary" variant="flat">Go to my wallet</v-btn>
        <v-btn to="/currencies" variant="text" class="ml-2">Back to currencies</v-btn>
      </template>

      <template v-else-if="state === 'stopped'">
        <h2>Payment not completed</h2>
        <p class="my-3">The payment was cancelled or not accepted. No money was taken from your card.</p>
        <v-btn to="/topup/card" color="primary" variant="flat">Try again</v-btn>
        <v-btn to="/topup" variant="text" class="ml-2">Other ways to top up</v-btn>
      </template>

      <template v-else-if="state === 'delayed'">
        <h2>Payment received, USDC on its way</h2>
        <p class="my-3">
          Your card payment went through, but your USDC could not be sent automatically. Nothing is lost. Contact support
          and we will send it to you.
        </p>
        <v-btn to="/activity" color="primary" variant="flat">See activity</v-btn>
      </template>

      <template v-else>
        <h2>Waiting for confirmation</h2>
        <p class="my-3">The payment has not been confirmed yet. This can take a minute. Check your wallet in a little while.</p>
        <v-btn to="/activity" color="primary" variant="flat">See activity</v-btn>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'

definePageMeta({ layout: 'dash', middleware: 'auth' })
useHead({ title: 'Card payment result' })

const { api } = useAuth()
const route = useRoute()
const state = ref<'checking' | 'credited' | 'stopped' | 'delayed' | 'pending'>('checking')
const amount = ref('')
const usdc = ref('')
let timer: ReturnType<typeof setTimeout> | null = null

async function check(attempt: number) {
  const session = typeof route.query.gateway_session_id === 'string' ? route.query.gateway_session_id : ''
  if (!session) {
    state.value = 'pending'
    return
  }
  try {
    const r = await api<{ status: string; amount: number; usdc: number | null }>(
      `/api/topup/card-result?gateway_session_id=${encodeURIComponent(session)}`,
    )
    if (r.amount) amount.value = r.amount.toFixed(2)
    if (r.usdc) usdc.value = r.usdc.toFixed(2)
    if (r.status === 'credited') return void (state.value = 'credited')
    if (r.status === 'failed' || r.status === 'cancelled') return void (state.value = 'stopped')
    if (r.status === 'delivery_failed') return void (state.value = 'delayed')
  } catch {
    // A short problem reading the result: look again below.
  }
  // The confirmation can arrive a little after the customer does. Look again for about 60 seconds.
  if (attempt < 20) {
    timer = setTimeout(() => check(attempt + 1), 3000)
  } else {
    // If getMondo sent the customer back as cancelled or rejected, say so even without a confirmation.
    state.value = route.params.outcome === 'completed' ? 'pending' : 'stopped'
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
