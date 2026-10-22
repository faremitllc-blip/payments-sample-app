<template>
  <div class="fm-wrap fm-app-main">
    <h1 class="fm-page-title">Bridge USDC</h1>
    <p class="fm-lede">
      Move USDC between your own wallets on different networks. The USDC is
      burned on one network and minted on the other, so you get real USDC, not a
      wrapped copy.
    </p>

    <v-alert v-if="error" type="error" variant="tonal" class="my-4" role="alert">
      {{ error }}
    </v-alert>

    <p v-if="loading" role="status" class="fm-balance-label">Loading…</p>

    <template v-else-if="data">
      <v-alert
        v-if="!data.sdkReady"
        type="warning"
        variant="tonal"
        class="my-4"
      >
        Bridging is not switched on yet. The site owner needs to add the
        Circle App Kit packages and redeploy.
      </v-alert>

      <div class="fm-list mb-6">
        <div v-for="n in data.networks" :key="n.id" class="fm-list-item">
          <div class="fm-who">
            <strong>{{ n.label }}</strong>
            <span v-if="n.address">{{ short(n.address) }}</span>
            <span v-else>No wallet on this network yet</span>
          </div>
          <div>
            <span v-if="n.address">
              {{ n.balance === null ? '—' : n.balance.toFixed(2) }} USDC
            </span>
            <v-btn
              v-else
              size="small"
              variant="tonal"
              :loading="creating === n.id"
              @click="createWallet(n.id)"
            >
              Add wallet
            </v-btn>
          </div>
        </div>
      </div>

      <div class="fm-form">
        <v-select
          v-model="from"
          :items="walletOptions"
          item-title="label"
          item-value="id"
          label="From"
          variant="outlined"
        />
        <v-select
          v-model="to"
          :items="walletOptions"
          item-title="label"
          item-value="id"
          label="To"
          variant="outlined"
        />
        <v-text-field
          v-model="amount"
          label="Amount (USDC)"
          inputmode="decimal"
          variant="outlined"
          :hint="`Between 1 and ${data.maxUsdc} USDC at a time`"
          persistent-hint
        />
        <p class="fm-notice mt-3">
          Each network charges a small fee in its own gas token, paid from the
          wallet on that network. A bridge usually takes a few minutes.
        </p>
        <v-btn
          color="primary"
          variant="flat"
          class="mt-4"
          :loading="starting"
          :disabled="!canStart"
          @click="start"
        >
          Bridge USDC
        </v-btn>
      </div>

      <h2 class="fm-page-title mt-8">Recent bridges</h2>
      <p v-if="!history.length" class="fm-balance-label">Nothing yet.</p>
      <div v-else class="fm-list">
        <div v-for="t in history" :key="t.id" class="fm-list-item">
          <div class="fm-who">
            <strong>{{ t.amount }} USDC</strong>
            <span>{{ label(t.from) }} → {{ label(t.to) }}</span>
            <span v-if="t.error">{{ t.error }}</span>
            <span v-for="s in t.steps" :key="s.name">
              {{ s.name }}: {{ s.state }}
              <a v-if="s.explorerUrl" :href="s.explorerUrl" target="_blank" rel="noopener">view</a>
            </span>
          </div>
          <div>
            <span>{{ statusText(t.status) }}</span>
            <v-btn
              v-if="t.status === 'failed' || t.status === 'stalled'"
              size="small"
              variant="tonal"
              class="ml-2"
              @click="retry(t.id)"
            >
              Retry
            </v-btn>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dash', middleware: 'auth' })
useHead({ title: 'Bridge USDC' })

interface NetworkRow {
  id: string
  label: string
  address: string | null
  balance: number | null
}
interface StepRow {
  name: string
  state: string
  explorerUrl?: string
}
interface HistoryRow {
  id: string
  from: string
  to: string
  amount: string
  status: string
  steps: StepRow[]
  error: string | null
}

const { api } = useAuth()
const loading = ref(true)
const error = ref('')
const data = ref<{
  networks: NetworkRow[]
  maxUsdc: number
  sdkReady: boolean
} | null>(null)
const history = ref<HistoryRow[]>([])
const from = ref('')
const to = ref('')
const amount = ref('')
const starting = ref(false)
const creating = ref('')
let timer: ReturnType<typeof setInterval> | null = null

const walletOptions = computed(() =>
  (data.value?.networks || []).filter((n) => n.address),
)
const canStart = computed(
  () =>
    Boolean(data.value?.sdkReady) &&
    Boolean(from.value) &&
    Boolean(to.value) &&
    from.value !== to.value &&
    Number(amount.value) >= 1 &&
    !history.value.some((t) => t.status === 'running'),
)

function short(a: string) {
  return `${a.slice(0, 8)}…${a.slice(-6)}`
}
function label(id: string) {
  return data.value?.networks.find((n) => n.id === id)?.label || id
}
function statusText(s: string) {
  return s === 'completed'
    ? 'Complete'
    : s === 'failed'
      ? 'Failed'
      : s === 'stalled'
        ? 'Interrupted'
        : 'In progress'
}

async function loadHistory() {
  const r = await api<{ transfers: HistoryRow[] }>('/api/crosschain/history')
  history.value = r.transfers
}
async function loadNetworks() {
  data.value = await api('/api/crosschain/networks')
}

function watch() {
  if (timer) return
  timer = setInterval(async () => {
    try {
      await loadHistory()
      if (!history.value.some((t) => t.status === 'running')) {
        if (timer) clearInterval(timer)
        timer = null
        await loadNetworks()
      }
    } catch {
      /* keep trying */
    }
  }, 5000)
}

async function createWallet(id: string) {
  error.value = ''
  creating.value = id
  try {
    await api('/api/crosschain/wallet', { method: 'POST', body: { blockchain: id } })
    await loadNetworks()
  } catch (err: any) {
    error.value = errorText(err)
  } finally {
    creating.value = ''
  }
}

async function start() {
  error.value = ''
  starting.value = true
  try {
    await api('/api/crosschain/start', {
      method: 'POST',
      body: {
        from: from.value,
        to: to.value,
        amount: amount.value.trim(),
        requestId: crypto.randomUUID(),
      },
    })
    amount.value = ''
    await loadHistory()
    watch()
  } catch (err: any) {
    error.value = errorText(err)
  } finally {
    starting.value = false
  }
}

async function retry(id: string) {
  error.value = ''
  try {
    await api('/api/crosschain/retry', { method: 'POST', body: { id } })
    await loadHistory()
    watch()
  } catch (err: any) {
    error.value = errorText(err)
  }
}

onMounted(async () => {
  try {
    await Promise.all([loadNetworks(), loadHistory()])
    const w = walletOptions.value
    if (w.length) from.value = w[0].id
    if (w.length > 1) to.value = w[1].id
    if (history.value.some((t) => t.status === 'running')) watch()
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
