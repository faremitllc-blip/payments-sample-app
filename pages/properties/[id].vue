<template>
  <div class="fm-wrap fm-app-main">
    <NuxtLink to="/properties" class="mo-muted">← All properties</NuxtLink>

    <v-alert v-if="error" type="error" variant="tonal" class="my-4" role="alert">{{ error }}</v-alert>
    <p v-if="loading" role="status" class="fm-balance-label mt-4">Loading…</p>

    <template v-else-if="d">
      <img v-if="d.property.imageUrl" :src="d.property.imageUrl" alt="" class="mo-pd-img" />
      <h1 class="fm-page-title mt-4">{{ d.property.title }}</h1>
      <p v-if="d.property.location" class="mo-muted">{{ d.property.location }}</p>
      <p v-if="d.property.description" class="mt-3" style="white-space: pre-line">{{ d.property.description }}</p>

      <section class="mo-card mt-4">
        <div class="mo-pd-bar" aria-hidden="true"><div :style="{ width: pct + '%' }"></div></div>
        <p class="mo-pd-nums">
          <strong>{{ fmt(d.chain.raised) }}</strong> of {{ fmt(d.chain.target) }} USDC raised ({{ pct }}%)
        </p>
        <p class="mo-muted">
          Status: <strong>{{ statusText }}</strong>
          <template v-if="d.chain.status === 'open'"> · closes {{ deadlineText }}</template>
        </p>
        <p v-if="d.property.expectedReturn" class="mo-muted">{{ d.property.expectedReturn }}</p>
        <p v-if="Number(d.chain.distributed) > 0" class="mo-muted">
          Paid out to owners so far: {{ fmt(d.chain.distributed) }} USDC
        </p>
      </section>

      <section v-if="d.position && Number(d.position.invested) > 0" class="mo-card mt-4">
        <h2>Your share</h2>
        <p>
          You put in <strong>{{ fmt(d.position.invested) }} USDC</strong>
          ({{ sharePct }}% of this property).
        </p>
        <p v-if="Number(d.position.claimed) > 0" class="mo-muted">
          Already paid to you: {{ fmt(d.position.claimed) }} USDC
        </p>
        <v-alert v-if="actionMsg" type="info" variant="tonal" class="my-3">{{ actionMsg }}</v-alert>
        <div class="d-flex ga-2 mt-3 flex-wrap">
          <v-btn
            v-if="Number(d.position.claimable) > 0"
            color="primary"
            variant="flat"
            :loading="acting === 'claim'"
            @click="act('claim')"
          >
            Claim {{ fmt(d.position.claimable) }} USDC
          </v-btn>
          <v-btn
            v-if="refundable"
            color="primary"
            variant="flat"
            :loading="acting === 'refund'"
            @click="act('refund')"
          >
            Get my {{ fmt(d.position.invested) }} USDC back
          </v-btn>
        </div>
      </section>

      <section v-if="d.chain.status === 'open' && !deadlinePassed" class="mo-card mt-4">
        <h2>Invest</h2>
        <template v-if="!d.wallet">
          <p class="mo-muted">
            You need a {{ d.pool.chainLabel }} wallet to invest. Add one on the
            Bridge page, then bridge some USDC to it.
          </p>
          <v-btn to="/bridge" variant="outlined" color="secondary" class="mt-3">Go to Bridge</v-btn>
        </template>
        <template v-else>
          <p class="mo-muted">
            Your {{ d.pool.chainLabel }} wallet holds
            <strong>{{ d.wallet.balanceUsdc === null ? '—' : fmt(String(d.wallet.balanceUsdc)) }} USDC</strong>.
            Still open: {{ fmt(d.chain.remaining) }} USDC. Minimum {{ d.property.minInvestUsdc }} USDC,
            maximum {{ d.pool.maxInvestUsdc }} USDC per investment.
          </p>
          <v-alert v-if="investError" type="error" variant="tonal" class="my-3" role="alert">{{ investError }}</v-alert>
          <v-text-field v-model="amount" label="Amount (USDC)" inputmode="decimal" class="mt-3" :disabled="running" />

          <label class="mo-pd-risk">
            <input v-model="agreed" type="checkbox" />
            <span>
              I understand that this is not a savings account or a guaranteed return. I can lose
              all the money I put in. The smart contract only holds the pool until the property is
              funded; after that the money goes to the property's buyer, and what happens next
              depends on that party and the legal agreements around it, not on the contract. My
              share cannot be sold or withdrawn early, and the property may take years to pay out.
            </span>
          </label>

          <v-btn
            color="primary"
            variant="flat"
            class="mt-3"
            :loading="starting"
            :disabled="!agreed || running || !Number(amount)"
            @click="start"
          >
            Invest
          </v-btn>
        </template>
      </section>

      <section v-if="d.investments.length" class="mo-card mt-4">
        <h2>Your investments</h2>
        <div class="fm-list">
          <div v-for="i in d.investments" :key="i.id" class="fm-list-item">
            <div class="fm-who">
              <strong>{{ i.amount }} USDC</strong>
              <span v-if="i.error">{{ i.error }}</span>
              <span v-for="s in i.steps" :key="s.name">{{ mark(s.state) }} {{ s.name }}</span>
            </div>
            <div>
              <span>{{ i.status === 'completed' ? 'Complete' : i.status === 'failed' ? 'Failed' : 'In progress' }}</span>
              <v-btn v-if="i.status === 'failed'" size="small" variant="tonal" class="ml-2" @click="retry(i.id)">
                Retry
              </v-btn>
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dash', middleware: 'auth' })
useHead({ title: 'Property' })

const route = useRoute()
const { api } = useAuth()
const id = String(route.params.id)

const loading = ref(true)
const error = ref('')
const investError = ref('')
const actionMsg = ref('')
const d = ref<any>(null)
const amount = ref('')
const agreed = ref(false)
const starting = ref(false)
const acting = ref('')
let timer: ReturnType<typeof setInterval> | null = null

const running = computed(() => (d.value?.investments || []).some((i: any) => i.status === 'running'))
const pct = computed(() => {
  const t = Number(d.value?.chain.target)
  return t > 0 ? Math.min(100, Math.floor((Number(d.value.chain.raised) / t) * 100)) : 0
})
const sharePct = computed(() => {
  const t = Number(d.value?.chain.target)
  return t > 0 ? ((Number(d.value.position.invested) / t) * 100).toFixed(2) : '0'
})
const deadlinePassed = computed(() => (d.value ? d.value.chain.deadline * 1000 <= Date.now() : false))
const deadlineText = computed(() =>
  d.value ? new Date(d.value.chain.deadline * 1000).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '',
)
const refundable = computed(
  () =>
    d.value &&
    Number(d.value.position?.invested) > 0 &&
    (d.value.chain.status === 'failed' || (d.value.chain.status === 'open' && deadlinePassed.value)),
)
const statusText = computed(() => {
  const s = d.value?.chain.status
  if (s === 'open' && deadlinePassed.value) return 'Not funded in time — refunds open'
  return (
    { open: 'Open for investment', funded: 'Funded', failed: 'Not funded — refunds open', closed: 'Sold and paid out' }[
      s as string
    ] || s
  )
})

function fmt(v: string) {
  return Number(v).toLocaleString('en-US', { maximumFractionDigits: 6 })
}
function mark(state: string) {
  return state === 'done' ? '✓' : state === 'failed' ? '✗' : state === 'running' ? '…' : '·'
}

async function load() {
  d.value = await api(`/api/properties/${id}`)
}

function poll() {
  if (timer) return
  timer = setInterval(async () => {
    try {
      for (const i of (d.value?.investments || []).filter((x: any) => x.status === 'running')) {
        await api('/api/properties/advance', { method: 'POST', body: { id: i.id } })
      }
      await load()
      if (!running.value && timer) {
        clearInterval(timer)
        timer = null
      }
    } catch {
      /* keep trying */
    }
  }, 6000)
}

async function start() {
  investError.value = ''
  starting.value = true
  try {
    await api('/api/properties/invest', {
      method: 'POST',
      body: { propertyId: id, amount: amount.value.trim(), requestId: crypto.randomUUID() },
    })
    amount.value = ''
    await load()
    poll()
  } catch (err: any) {
    investError.value = errorText(err)
  } finally {
    starting.value = false
  }
}

async function retry(investmentId: string) {
  investError.value = ''
  try {
    await api('/api/properties/retry', { method: 'POST', body: { id: investmentId } })
    await load()
    poll()
  } catch (err: any) {
    investError.value = errorText(err)
  }
}

async function act(kind: 'claim' | 'refund') {
  actionMsg.value = ''
  investError.value = ''
  acting.value = kind
  try {
    await api(`/api/properties/${kind}`, {
      method: 'POST',
      body: { propertyId: id, requestId: crypto.randomUUID() },
    })
    actionMsg.value = 'Submitted. The USDC should reach your wallet in about a minute.'
    setTimeout(() => load().catch(() => undefined), 20000)
  } catch (err: any) {
    investError.value = errorText(err)
  } finally {
    acting.value = ''
  }
}

onMounted(async () => {
  try {
    await load()
    if (running.value) poll()
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
.mo-pd-img {
  display: block;
  width: 100%;
  max-height: 320px;
  object-fit: cover;
  border-radius: 12px;
  margin-top: 12px;
}
.mo-pd-bar {
  height: 10px;
  border-radius: 5px;
  background: rgba(128, 128, 128, 0.25);
  overflow: hidden;
}
.mo-pd-bar div {
  height: 100%;
  background: #ff4b33;
}
.mo-pd-nums {
  margin: 10px 0 4px;
}
.mo-pd-risk {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-top: 12px;
  font-size: 0.85rem;
}
.mo-pd-risk input {
  margin-top: 4px;
}
</style>
