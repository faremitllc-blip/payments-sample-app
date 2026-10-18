<template>
  <section class="mo-act" :class="`is-${decision.status}`" :aria-label="title">
    <div class="mo-act-head">
      <span class="mo-act-icon" aria-hidden="true">
        <v-icon size="20">{{ icon }}</v-icon>
      </span>
      <div>
        <p class="mo-act-kicker">Needs your approval</p>
        <h3>{{ title }}</h3>
      </div>
    </div>

    <dl v-if="rows.length > 0" class="mo-act-rows">
      <div v-for="row in rows" :key="row.label">
        <dt>{{ row.label }}</dt>
        <dd :class="{ 'is-code': row.code }">{{ row.value }}</dd>
      </div>
    </dl>

    <p v-if="warning && decision.status === 'pending'" class="mo-act-warn">
      {{ warning }}
    </p>

    <div v-if="decision.status === 'pending'" class="mo-act-buttons">
      <v-btn color="primary" variant="flat" :disabled="disabled" @click="$emit('approve')">
        {{ approveLabel }}
      </v-btn>
      <v-btn variant="outlined" color="secondary" :disabled="disabled" @click="$emit('decline')">
        Decline
      </v-btn>
    </div>
    <p v-else-if="decision.status === 'running'" class="mo-act-state" role="status">
      Working on it…
    </p>
    <p v-else-if="decision.status === 'done'" class="mo-act-state is-ok" role="status">
      <v-icon size="18" aria-hidden="true">mdi-check-circle</v-icon> Approved and done
    </p>
    <p v-else-if="decision.status === 'declined'" class="mo-act-state">
      <v-icon size="18" aria-hidden="true">mdi-close-circle-outline</v-icon> Not approved. Nothing was done
    </p>
    <p v-else class="mo-act-state is-bad" role="alert">
      <v-icon size="18" aria-hidden="true">mdi-alert-circle-outline</v-icon>
      {{ decision.note || 'That did not work' }}
    </p>
  </section>
</template>

<script setup lang="ts">
import type { Decision } from '~/composables/useAgent'

const props = defineProps({
  name: { type: String, required: true },
  input: { type: Object as () => Record<string, string>, required: true },
  decision: { type: Object as () => Decision, required: true },
  network: { type: String, default: '' },
  live: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})

defineEmits(['approve', 'decline'])

const CURRENCY: Record<string, string> = { usd: 'US dollar (USD)', eur: 'Euro (EUR)', gbp: 'British pound (GBP)' }

const title = computed(() => {
  switch (props.name) {
    case 'send_usdc':
      return `Send ${props.input.amount} USDC`
    case 'create_wallet':
      return 'Create your USDC wallet'
    case 'start_identity_verification':
      return 'Start your identity check'
    case 'open_bank_account':
      return `Open a ${(props.input.currency || '').toUpperCase()} bank account`
    default:
      return 'Action'
  }
})

const icon = computed(() => {
  switch (props.name) {
    case 'send_usdc':
      return 'mdi-arrow-top-right'
    case 'create_wallet':
      return 'mdi-wallet-outline'
    case 'start_identity_verification':
      return 'mdi-shield-check-outline'
    default:
      return 'mdi-bank-outline'
  }
})

const rows = computed(() => {
  const input = props.input
  switch (props.name) {
    case 'send_usdc':
      return [
        { label: 'Amount', value: `${input.amount} USDC`, code: false },
        { label: 'To', value: input.to, code: true },
        ...(props.network ? [{ label: 'Network', value: props.network, code: false }] : []),
      ]
    case 'start_identity_verification':
      return [
        { label: 'Name', value: input.full_name, code: false },
        { label: 'Type', value: input.type === 'business' ? 'Business' : 'Personal', code: false },
      ]
    case 'open_bank_account':
      return [{ label: 'Currency', value: CURRENCY[input.currency] || input.currency, code: false }]
    default:
      return []
  }
})

const warning = computed(() => {
  if (props.name === 'send_usdc') {
    return props.live
      ? 'This sends real money and cannot be undone. Check the address character by character.'
      : 'Test mode: this uses test USDC.'
  }
  return ''
})

const approveLabel = computed(() => (props.name === 'send_usdc' ? 'Approve and send' : 'Approve'))
</script>
