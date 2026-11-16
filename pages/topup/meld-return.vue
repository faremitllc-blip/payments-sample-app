<template>
  <div class="fm-wrap fm-app-main">
    <section class="mo-card mo-ret" role="status" aria-live="polite">
      <template v-if="state === 'checking'">
        <h2>Checking your purchase…</h2>
        <p class="my-3 mo-muted">One moment while we confirm it.</p>
      </template>
      <template v-else-if="state === 'credited'">
        <h2>Purchase complete</h2>
        <p class="my-3">
          {{ usdc ? `${usdc} USDC has been sent to your Mondo wallet.` : 'Your USDC has been sent to your Mondo wallet.' }}
        </p>
        <v-btn to="/wallet" color="primary" variant="flat">Go to my wallet</v-btn>
        <v-btn to="/currencies" variant="text" class="ml-2">Back to currencies</v-btn>
      </template>
      <template v-else-if="state === 'stopped'">
        <h2>Purchase not completed</h2>
        <p class="my-3">The payment was cancelled or not accepted.</p>
        <v-btn to="/topup/buy" color="primary" variant="flat">Try again</v-btn>
        <v-btn to="/topup" variant="text" class="ml-2">Other ways to top up</v-btn>
      </template>
      <template v-else>
        <h2>Waiting for confirmation</h2>
        <p class="my-3">
          Your payment has not been confirmed yet. Card purchases can take a few minutes. Your USDC will appear in your
          wallet once it is done.
        </p>
        <v-btn to="/activity" color="primary" variant="flat">See activity</v-btn>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'

definePageMeta({ layout: 'dash', middleware: 'auth' })
useHead({ title: 'Purchase result' })

const { api } = useAuth()
const route = useRoute()
const state = ref<'checking' | 'credited' | 'stopped' | 'pending'>('checking')
const usdc = ref('')
let timer: ReturnType<typeof setTimeout> | null = null

async function check(attempt: number) {
  const id = typeof route.query.id === 'string' ? route.query.id : ''
  if (!id) return void (state.value = 'pending')
  try {
    const r = await api<{ status: string; usdc: number | null }>(`/api/topup/meld-result?id=${encodeURIComponent(id)}`)
    if (r.usdc) usdc.value = Number(r.usdc).toFixed(2)
    if (r.status === 'credited') return void (state.value = 'credited')
    if (r.status === 'failed' || r.status === 'cancelled') return void (state.value = 'stopped')
  } catch {
    // Look again below.
  }
  if (attempt < 20) timer = setTimeout(() => check(attempt + 1), 3000)
  else state.value = 'pending'
}

onMounted(() => check(0))
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<style scoped>
.mo-ret { max-width: 560px; padding: 24px; }
</style>
