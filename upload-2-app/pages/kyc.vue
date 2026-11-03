<template>
  <div class="mo-kyc">
    <h1 class="fm-page-title">KYC status</h1>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4" role="alert">
      {{ error }}
    </v-alert>

    <p v-if="loading" role="status" class="fm-balance-label">Loading…</p>

    <section v-else-if="!bankConfigured" class="mo-card mo-empty-card">
      <h2>Bank accounts aren't switched on</h2>
      <p class="mo-muted mt-2">
        The identity check is only needed for bank accounts, and they aren't set
        up in this app yet.
      </p>
    </section>

    <template v-else>
      <section class="mo-card mo-kyc-banner" :class="`is-${overall.tone}`">
        <span class="mo-kyc-icon" aria-hidden="true">
          <v-icon size="30">{{ overall.icon }}</v-icon>
        </span>
        <div class="mo-kyc-banner-text">
          <p class="mo-kyc-kicker">Identity check</p>
          <h2>{{ overall.title }}</h2>
          <p class="mo-muted">{{ overall.text }}</p>
        </div>
        <v-btn
          v-if="overall.cta"
          :to="overall.cta.to"
          color="primary"
          variant="flat"
        >
          {{ overall.cta.label }}
        </v-btn>
      </section>

      <section class="mo-card">
        <div class="mo-card-head">
          <h2>Progress</h2>
          <v-btn
            size="small"
            variant="text"
            color="secondary"
            :loading="refreshing"
            @click="refresh"
          >
            Check again
          </v-btn>
        </div>
        <ol class="mo-kyc-steps">
          <li v-for="step in steps" :key="step.title" :class="`is-${step.state}`">
            <span class="mo-kyc-dot" aria-hidden="true">
              <v-icon size="18">{{ step.icon }}</v-icon>
            </span>
            <div>
              <strong>{{ step.title }}</strong>
              <span class="mo-muted">{{ step.text }}</span>
            </div>
            <span class="mo-status" :class="step.chipClass">{{ step.chip }}</span>
          </li>
        </ol>
        <p v-if="status?.kycStatus === 'rejected'" class="fm-notice">
          Your verification was not approved. Please contact support.
        </p>
      </section>

      <section class="mo-card">
        <div class="mo-card-head"><h2>What you can open</h2></div>
        <ul class="mo-kyc-list">
          <li v-for="row in access" :key="row.code">
            <span class="mo-bank-code">{{ row.code }}</span>
            <div>
              <strong>{{ row.name }}</strong>
              <span class="mo-muted">{{ row.how }}</span>
            </div>
            <span class="mo-status" :class="row.chipClass">{{ row.chip }}</span>
          </li>
        </ul>
        <p v-if="status" class="mo-muted mo-foot">
          Account type: {{ status.customerType === 'business' ? 'Business' : 'Personal' }}
        </p>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { errorText } from '~/composables/useAuth'
import {
  CURRENCY_INFO,
  endorsementState,
  kycHeadline,
  type BankCurrency,
} from '~/utils/bank'

definePageMeta({ layout: 'dash', middleware: 'auth' })
useHead({ title: 'KYC status' })

const { configured: bankConfigured, status, accounts, load } = useBank()

const loading = ref(true)
const refreshing = ref(false)
const error = ref('')

const termsDone = computed(() => status.value?.tosStatus === 'approved')
const kycDone = computed(() => status.value?.kycStatus === 'approved')
const open = (currency: string) => accounts.value.some((a) => a.currency === currency)

const overall = computed(() => {
  const s = status.value
  if (!s) {
    return {
      tone: 'none',
      icon: 'mdi-shield-outline',
      title: 'Not started',
      text: 'Verify your identity once to unlock USD, EUR and GBP bank accounts.',
      cta: { to: '/bank', label: 'Start verification' },
    }
  }
  if (s.approved) {
    return {
      tone: 'ok',
      icon: 'mdi-shield-check',
      title: 'Verified',
      text: 'Your identity is confirmed. You can open bank accounts.',
      cta: { to: '/bank', label: 'Open bank accounts' },
    }
  }
  if (s.kycStatus === 'rejected') {
    return {
      tone: 'bad',
      icon: 'mdi-shield-alert',
      title: 'Not approved',
      text: 'We could not approve your verification. Please contact support.',
      cta: null,
    }
  }
  if (s.kycStatus === 'under_review') {
    return {
      tone: 'wait',
      icon: 'mdi-shield-sync',
      title: 'Under review',
      text: 'Your documents are being checked. This can take a little while. Check back soon.',
      cta: null,
    }
  }
  return {
    tone: 'wait',
    icon: 'mdi-shield-half-full',
    title: kycHeadline(s.kycStatus, s.tosStatus, s.approved),
    text: 'Finish the steps below to complete your verification.',
    cta: { to: '/verify', label: 'Continue verification' },
  }
})

const steps = computed(() => {
  const s = status.value
  const kyc = s?.kycStatus || 'not_started'
  const kycState = kycDone.value
    ? 'done'
    : kyc === 'rejected'
      ? 'bad'
      : kyc === 'under_review' || kyc === 'incomplete'
        ? 'wait'
        : 'todo'
  const kycText = {
    approved: 'Your identity is confirmed.',
    rejected: 'This was not approved.',
    under_review: 'Being checked now.',
    incomplete: 'More information is needed.',
  }[kyc as string] || 'Not finished yet.'

  const chip = (state: string) =>
    state === 'done'
      ? { chip: 'Done', chipClass: 'is-complete' }
      : state === 'bad'
        ? { chip: 'Not approved', chipClass: 'is-failed' }
        : state === 'wait'
          ? { chip: 'In progress', chipClass: '' }
          : { chip: 'To do', chipClass: 'is-none' }
  const icon = (state: string) =>
    state === 'done' ? 'mdi-check' : state === 'bad' ? 'mdi-close' : state === 'wait' ? 'mdi-dots-horizontal' : 'mdi-circle-small'

  const termsState = !s ? 'todo' : termsDone.value ? 'done' : 'wait'
  const startState = s ? 'done' : 'todo'
  const bankState = s?.approved ? 'done' : 'todo'
  const list = [
    { title: 'Start verification', text: s ? 'Your verification was started.' : 'Tell us your name to begin.', state: startState },
    { title: 'Accept the terms', text: termsDone.value ? 'Terms accepted.' : 'Read and accept the terms.', state: termsState },
    { title: 'Verify your identity', text: s ? kycText : 'Comes after the terms.', state: s ? kycState : 'todo' },
    { title: 'Bank access', text: s?.approved ? 'You can open accounts.' : 'Unlocks once you are verified.', state: bankState },
  ]
  return list.map((step) => ({ ...step, ...chip(step.state), icon: icon(step.state) }))
})

const access = computed(() =>
  (['usd', 'eur', 'gbp'] as BankCurrency[]).map((currency) => {
    const info = CURRENCY_INFO[currency]
    let chip = 'Needs verification'
    let chipClass = 'is-none'
    if (open(currency)) {
      chip = 'Open'
      chipClass = 'is-complete'
    } else if (status.value?.approved) {
      const state = endorsementState(status.value.endorsements, currency)
      if (state === 'ok') {
        chip = 'Ready to open'
        chipClass = 'is-complete'
      } else if (state === 'missing') {
        chip = 'Not enabled yet'
      } else {
        chip = 'Ready to try'
      }
    }
    return { code: info.code, name: info.name, how: info.how, chip, chipClass }
  }),
)

async function refresh() {
  error.value = ''
  refreshing.value = true
  try {
    await load(true)
  } catch (err: any) {
    error.value = errorText(err)
  } finally {
    refreshing.value = false
  }
}

onMounted(async () => {
  try {
    await load()
  } catch (err: any) {
    error.value = errorText(err)
  } finally {
    loading.value = false
  }
})
</script>
