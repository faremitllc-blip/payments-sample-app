<template>
  <div class="fm-wrap fm-app-main">
    <h1 class="fm-page-title">Pay by card</h1>
    <p class="fm-lede">
      Pay in euros with a Visa or Mastercard. Your bank may ask you to confirm the payment. The USDC arrives in your
      Mondo wallet once the payment is confirmed.
    </p>

    <v-alert v-if="error" type="error" variant="tonal" class="my-4" role="alert">{{ error }}</v-alert>

    <form class="mo-card mo-cardform" autocomplete="on" novalidate @submit.prevent="submit">
      <v-text-field
        v-model="amount"
        label="Amount in euros"
        prefix="€"
        inputmode="decimal"
        variant="outlined"
        density="comfortable"
        :hint="preview"
        persistent-hint
      />

      <p class="fm-balance-label mt-4">Card</p>
      <v-text-field
        v-model="cardNumber"
        label="Card number"
        inputmode="numeric"
        autocomplete="cc-number"
        name="cardnumber"
        variant="outlined"
        density="comfortable"
      />
      <div class="mo-row">
        <v-text-field v-model="expMonth" label="Month (MM)" inputmode="numeric" autocomplete="cc-exp-month" maxlength="2" variant="outlined" density="comfortable" />
        <v-text-field v-model="expYear" label="Year (YYYY)" inputmode="numeric" autocomplete="cc-exp-year" maxlength="4" variant="outlined" density="comfortable" />
        <v-text-field v-model="cvv" label="Security code" inputmode="numeric" autocomplete="cc-csc" maxlength="4" type="password" variant="outlined" density="comfortable" />
      </div>
      <v-text-field v-model="name" label="Name on card" autocomplete="cc-name" variant="outlined" density="comfortable" />

      <p class="fm-balance-label mt-2">About you</p>
      <v-text-field v-model="birthDate" label="Date of birth" type="date" autocomplete="bday" variant="outlined" density="comfortable" />
      <div class="mo-row2">
        <v-text-field v-model="phoneCountry" label="Phone country (3 letters)" hint="For example SOM, GBR, KEN" maxlength="3" variant="outlined" density="comfortable" />
        <v-text-field v-model="phone" label="Phone number" inputmode="tel" autocomplete="tel-national" variant="outlined" density="comfortable" />
      </div>
      <v-text-field v-model="citizenship" label="Citizenship (3 letters)" hint="For example SOM, GBR, KEN" maxlength="3" variant="outlined" density="comfortable" />

      <p class="mo-muted mb-3">
        Your card details go straight to our payment partner and are not stored by Mondo. Only Visa and Mastercard are
        accepted.
      </p>

      <div class="mo-actions">
        <v-btn class="mo-grad" variant="flat" type="submit" :loading="busy" :disabled="!ready">Pay by card</v-btn>
        <v-btn variant="text" to="/topup">Back</v-btn>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { errorText, useAuth } from '~/composables/useAuth'

definePageMeta({ layout: 'dash', middleware: 'auth' })
useHead({ title: 'Pay by card' })

const { api } = useAuth()
const busy = ref(false)
const error = ref('')
const rate = ref(0)

const amount = ref('')
const cardNumber = ref('')
const expMonth = ref('')
const expYear = ref('')
const cvv = ref('')
const name = ref('')
const birthDate = ref('')
const phoneCountry = ref('')
const phone = ref('')
const citizenship = ref('')

const euro = computed(() => Number(amount.value))
const preview = computed(() =>
  rate.value && euro.value > 0 ? `About ${(euro.value / rate.value).toFixed(2)} USDC at today's rate` : '',
)
const ready = computed(
  () =>
    euro.value >= 1 &&
    cardNumber.value.replace(/\D/g, '').length >= 16 &&
    expMonth.value.length >= 1 &&
    expYear.value.length === 4 &&
    cvv.value.length >= 3 &&
    name.value.trim().length >= 2 &&
    !!birthDate.value &&
    phoneCountry.value.length === 3 &&
    phone.value.replace(/\D/g, '').length >= 5 &&
    citizenship.value.length === 3,
)

onMounted(async () => {
  try {
    const r = await api<{ rates: Record<string, number> }>('/api/rates')
    rate.value = r.rates.EUR || 0
  } catch {
    // The estimate is only a hint.
  }
})

async function submit() {
  if (!ready.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const r = await api<{ redirectUrl: string }>('/api/topup/card-start', {
      method: 'POST',
      body: {
        amount: amount.value,
        cardNumber: cardNumber.value,
        expMonth: expMonth.value,
        expYear: expYear.value,
        cvv: cvv.value,
        name: name.value,
        birthDate: birthDate.value,
        phoneCountry: phoneCountry.value.toUpperCase(),
        phone: phone.value,
        citizenship: citizenship.value.toUpperCase(),
      },
    })
    // Clear the card details from the page before leaving it.
    cardNumber.value = ''
    cvv.value = ''
    window.location.href = r.redirectUrl
  } catch (err: any) {
    error.value = errorText(err)
    busy.value = false
  }
}
</script>

<style scoped>
.mo-cardform { max-width: 560px; padding: 20px; }
.mo-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
.mo-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.mo-actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-top: 12px; }
.mo-grad.v-btn { background: linear-gradient(135deg, #2554e8 0%, #ff4b33 100%) !important; color: #fff !important; }
.mo-grad.v-btn--disabled { opacity: 0.45; }
@media (max-width: 520px) { .mo-row { grid-template-columns: 1fr 1fr; } }
</style>
