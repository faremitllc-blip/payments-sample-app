<template>
  <div class="fm-wrap fm-app-main">
    <h1 class="fm-page-title">Buy USDC</h1>

    <v-alert
      v-if="error"
      type="error"
      variant="tonal"
      class="my-4"
      role="alert"
    >
      {{ error }}
    </v-alert>

    <p v-if="loading" role="status" class="fm-balance-label">Loading…</p>

    <div v-else-if="config && !config.ready" class="mo-card mo-empty-card mt-4">
      <h2>Buying USDC is not available</h2>
      <p class="mo-muted mt-2 mb-4">{{ config.message }}</p>
      <v-btn
        v-if="config.reason === 'no_wallet'"
        to="/wallet"
        color="primary"
        variant="flat"
      >
        Go to my wallet
      </v-btn>
    </div>

    <template v-else-if="config">
      <p class="fm-lede">
        Pay with a debit card, Apple Pay, Google Pay or a bank transfer, where
        available. The USDC goes straight into your Mondo wallet.
      </p>

      <p v-if="config.sandbox" class="fm-notice">
        Test mode: no real money moves and the USDC has no value. Use dummy
        details only.
      </p>
      <p v-else class="fm-notice">
        This buys real USDC. Check the amount carefully before you pay.
      </p>

      <p v-if="done" role="status" class="mo-ok mt-4">
        Your purchase went through. Your balance will update shortly.
        <NuxtLink to="/wallet">Back to my wallet</NuxtLink>
      </p>

      <v-btn
        v-if="!started"
        size="large"
        color="primary"
        variant="flat"
        class="mt-6"
        :loading="starting"
        @click="start"
      >
        Buy USDC
      </v-btn>

      <div v-show="started" ref="root" class="mo-onramp-root mt-6"></div>

      <v-btn
        v-if="started"
        variant="outlined"
        color="secondary"
        class="mt-4"
        @click="stop"
      >
        Close
      </v-btn>
    </template>
  </div>
</template>

<script setup lang="ts">
import { errorText } from '~/composables/useAuth'

definePageMeta({ layout: 'dash', middleware: 'auth' })
useHead({ title: 'Buy USDC' })

interface OnrampConfig {
  ready: boolean
  reason: string
  message: string
  sandbox: boolean
  widgetBaseUrl: string
  network: string
}

const { api } = useAuth()
const { loadBalance, loadActivity } = useWallet()

const config = ref<OnrampConfig | null>(null)
const loading = ref(true)
const starting = ref(false)
const started = ref(false)
const done = ref(false)
const error = ref('')
const root = ref<HTMLElement | null>(null)

let widget: { close: () => void } | undefined

async function start() {
  error.value = ''
  done.value = false
  starting.value = true
  try {
    // The session is made on our server for the signed-in user's own wallet.
    const session = await api<Record<string, unknown>>('/api/onramp/session', {
      method: 'POST',
    })
    const { AppKit } = await import('@circle-fin/app-kit')
    const kit = new AppKit({
      onramp: { widgetBaseUrl: config.value?.widgetBaseUrl },
    } as any)

    started.value = true
    await nextTick()
    const container = root.value
    if (!container) {
      throw new Error('The buying window could not be opened.')
    }
    widget?.close()
    widget = (kit as any).onramp.mountIframe({
      session,
      container,
      onDepositSettled: () => {
        done.value = true
        // The browser can miss this event if the tab is closed early, so the
        // balance is also refreshed whenever the wallet screens load.
        loadBalance().catch(() => undefined)
        loadActivity().catch(() => undefined)
      },
      onDepositNotCompleted: ({ code }: { code?: string }) => {
        error.value = code
          ? `The purchase was not completed (${code}).`
          : 'The purchase was not completed.'
      },
    })
  } catch (err: any) {
    started.value = false
    error.value = errorText(err)
  } finally {
    starting.value = false
  }
}

function stop() {
  widget?.close()
  widget = undefined
  started.value = false
}

onMounted(async () => {
  try {
    config.value = await api<OnrampConfig>('/api/onramp/config')
  } catch (err: any) {
    error.value = errorText(err)
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(stop)
</script>

<style scoped>
.mo-onramp-root {
  width: 100%;
  max-width: 520px;
  height: 720px;
  border-radius: 16px;
  overflow: hidden;
}

.mo-ok {
  padding: 12px 16px;
  border-radius: 12px;
  background: #dff5ea;
  color: #0a5a3b;
  font-weight: 600;
}
</style>
