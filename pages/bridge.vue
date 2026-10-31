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
        v-if="!data.networks.length"
        type="warning"
        variant="tonal"
        class="my-4"
      >
        Bridging only works with live Circle keys.
      </v-alert>
      <p v-if="running" class="fm-notice mb-4" role="status">
        A bridge is in progress. Keep this page open: it moves to the next step
        every few seconds, and it can take about 15 minutes in total.
      </p>

      <div class="fm-list mb-6">
        <div v-for="n in data.networks" :key="n.id" class="fm-list-item">
          <div class="fm-who">
            <strong>{{ n.label }}</strong>
            <span v-if="n.address">{{ short(n.address) }}</span>
            <span v-else>No wallet on this network yet</span>
          </div>
          <div class="mo-bridge-actions">
            <template v-if="n.address">
              <span class="mo-bridge-bal">
                {{ n.balance === null ? '—' : n.balance.toFixed(2) }} USDC
              </span>
              <v-btn
                size="small"
                :variant="from === n.id ? 'flat' : 'outlined'"
                :color="from === n.id ? 'primary' : undefined"
                @click="pickFrom(n.id)"
              >
                From
              </v-btn>
              <v-btn
                size="small"
                :variant="to === n.id ? 'flat' : 'outlined'"
                :color="to === n.id ? 'secondary' : undefined"
                @click="pickTo(n.id)"
              >
                To
              </v-btn>
            </template>
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

      <p class="mo-bridge-summary">
        <template v-if="from && to && from !== to">
          Bridging from <strong>{{ label(from) }}</strong> to
          <strong>{{ label(to) }}</strong>
        </template>
        <template v-else>
          Press <strong>From</strong> on the wallet that holds the USDC, then
          <strong>To</strong> on the wallet that should receive it.
        </template>
      </p>

      <div class="fm-form">
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
          wallet on that network, so each wallet needs a little gas (for example POL on Polygon, ETH on Base). The bridge has four steps and is free of Circle fees.
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

      <h2 class="mo-bridge-h2">Recent bridges</h2>
      <p v-if="!history.length" class="fm-balance-label">Nothing yet.</p>
      <div v-else class="fm-list">
        <div v-for="t in history" :key="t.id" class="fm-list-item">
          <div class="fm-who">
            <strong>{{ t.amount }} USDC</strong>
            <span>{{ label(t.from) }} → {{ label(t.to) }}</span>
            <span v-if="t.error">{{ t.error }}</span>
            <span v-for="s in t.steps" :key="s.name">
              {{ stepMark(s.state) }} {{ s.name }}
              <a v-if="s.explorerUrl" :href="s.explorerUrl" target="_blank" rel="noopener">view</a>
            </span>
          </div>
          <div>
            <span>{{ statusText(t.status) }}</span>
            <v-btn
              v-if="t.status === 'failed'"
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
    <p class="mo-bridge-version">Bridge page v54</p>
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
  state: 'waiting' | 'running' | 'done' | 'failed'
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
  live: boolean
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
    Boolean(data.value?.networks.length) &&
    Boolean(from.value) &&
    Boolean(to.value) &&
    from.value !== to.value &&
    Number(amount.value) >= 1 &&
    !history.value.some((t) => t.status === 'running'),
)

function pickFrom(id: string) {
  from.value = id
  if (to.value === id) to.value = ''
}
function pickTo(id: string) {
  to.value = id
  if (from.value === id) from.value = ''
}
function short(a: string) {
  return `${a.slice(0, 8)}…${a.slice(-6)}`
}
function label(id: string) {
  return data.value?.networks.find((n) => n.id === id)?.label || id
}
function statusText(s: string) {
  return s === 'completed' ? 'Complete' : s === 'failed' ? 'Failed' : 'In progress'
}
function stepMark(s: StepRow['state']) {
  return s === 'done' ? '✓' : s === 'failed' ? '✗' : s === 'running' ? '…' : '·'
}
const running = computed(() => history.value.some((t) => t.status === 'running'))

async function loadHistory() {
  const r = await api<{ transfers: HistoryRow[] }>('/api/crosschain/history')
  history.value = r.transfers
}
async function loadNetworks() {
  data.value = await api('/api/crosschain/networks')
}

function pollHistory() {
  if (timer) return
  timer = setInterval(async () => {
    try {
      // Nudge each running bridge to its next step, then refresh the list.
      for (const t of history.value.filter((x) => x.status === 'running')) {
        await api('/api/crosschain/advance', { method: 'POST', body: { id: t.id } })
      }
      await loadHistory()
      if (!history.value.some((t) => t.status === 'running')) {
        if (timer) clearInterval(timer)
        timer = null
        await loadNetworks()
      }
    } catch {
      /* keep trying */
    }
  }, 6000)
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
    pollHistory()
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
    pollHistory()
  } catch (err: any) {
    error.value = errorText(err)
  }
}

// Pick sensible defaults: from = the wallet holding the most USDC, to = another one.
let defaultsSet = false
watch(walletOptions, (list) => {
  if (defaultsSet || list.length < 2) return
  defaultsSet = true
  if (!list.some((n) => n.id === from.value)) {
    const best = [...list].sort((a, b) => (b.balance || 0) - (a.balance || 0))[0]
    from.value = best ? best.id : ''
  }
  if (!list.some((n) => n.id === to.value) || to.value === from.value) {
    const other = list.find((n) => n.id !== from.value)
    to.value = other ? other.id : ''
  }
})

onMounted(async () => {
  try {
    await Promise.all([loadNetworks(), loadHistory()])
    if (history.value.some((t) => t.status === 'running')) pollHistory()
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
.mo-bridge-field {
  display: block;
  margin-bottom: 16px;
}
.mo-bridge-field span {
  display: block;
  font-size: 0.85rem;
  margin-bottom: 6px;
  opacity: 0.8;
}
.mo-bridge-field select {
  width: 100%;
  padding: 14px 12px;
  border-radius: 8px;
  border: 1px solid rgba(128, 128, 128, 0.5);
  background: transparent;
  color: inherit;
  font: inherit;
}
.mo-bridge-field select option {
  color: #111;
}
.mo-bridge-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.mo-bridge-bal {
  margin-right: 6px;
}
.mo-bridge-summary {
  margin: 0 0 16px;
}
.mo-bridge-h2 {
  font-size: 1.15rem;
  margin: 32px 0 12px;
}
.mo-bridge-version {
  margin-top: 32px;
  font-size: 0.75rem;
  opacity: 0.5;
}
</style>
