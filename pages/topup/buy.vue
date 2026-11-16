<template>
  <div class="fm-wrap fm-app-main">
    <h1 class="fm-page-title">Buy USDC</h1>
    <p class="fm-lede">
      Pay with a card or a local payment method. Our payment partner picks the best option for your country, and the USDC
      arrives in your Mondo wallet once the payment is confirmed.
    </p>

    <v-alert v-if="error" type="error" variant="tonal" class="my-4" role="alert">{{ error }}</v-alert>

    <form class="mo-card mo-buyform" novalidate @submit.prevent="submit">
      <div class="mo-row">
        <v-text-field
          v-model="amount"
          label="Amount"
          inputmode="decimal"
          variant="outlined"
          density="comfortable"
        />
        <v-select v-model="currency" :items="['EUR', 'USD', 'GBP']" label="Currency" variant="outlined" density="comfortable" />
      </div>
      <v-text-field
        v-model="country"
        label="Your country (2 letters)"
        hint="For example KE, GB, DE, US"
        persistent-hint
        maxlength="2"
        variant="outlined"
        density="comfortable"
      />
      <p v-if="quote" class="mo-quote">You will get about <strong>{{ quote }} USDC</strong></p>

      <div class="mo-actions">
        <v-btn variant="outlined" :loading="quoting" :disabled="!ready" @click="getQuote">See how much I get</v-btn>
        <v-btn class="mo-grad" variant="flat" type="submit" :loading="busy" :disabled="!ready">Continue</v-btn>
        <v-btn variant="text" to="/topup">Back</v-btn>
      </div>
      <p class="mo-muted mt-4">
        You pay on our payment partner's secure page. Mondo never sees your card details.
      </p>
    </form>
  </div>
</template>

<script setup lang="ts">
import { errorText, useAuth } from '~/composables/useAuth'

definePageMeta({ layout: 'dash', middleware: 'auth' })
useHead({ title: 'Buy USDC' })

const { api } = useAuth()
const amount = ref('')
const currency = ref('EUR')
const country = ref('')
const quote = ref('')
const error = ref('')
const busy = ref(false)
const quoting = ref(false)

const ready = computed(() => Number(amount.value) >= 1 && /^[A-Za-z]{2}$/.test(country.value))
const body = () => ({
  amount: amount.value,
  currency: currency.value,
  country: country.value.toUpperCase(),
})

watch([amount, currency, country], () => {
  quote.value = ''
})

async function getQuote() {
  if (!ready.value || quoting.value) return
  quoting.value = true
  error.value = ''
  try {
    const r = await api<{ usdc: number }>('/api/topup/meld-quote', { method: 'POST', body: body() })
    quote.value = r.usdc.toFixed(2)
  } catch (err: any) {
    error.value = errorText(err)
  } finally {
    quoting.value = false
  }
}

async function submit() {
  if (!ready.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const r = await api<{ widgetUrl: string }>('/api/topup/meld-start', { method: 'POST', body: body() })
    window.location.href = r.widgetUrl
  } catch (err: any) {
    error.value = errorText(err)
    busy.value = false
  }
}
</script>

<style scoped>
.mo-buyform { max-width: 560px; padding: 20px; }
.mo-row { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; }
.mo-quote { margin: 12px 0; }
.mo-actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-top: 12px; }
.mo-grad.v-btn { background: linear-gradient(135deg, #2554e8 0%, #ff4b33 100%) !important; color: #fff !important; }
.mo-grad.v-btn--disabled { opacity: 0.45; }
</style>
