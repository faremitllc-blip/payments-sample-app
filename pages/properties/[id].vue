<template>
  <div class="fm-wrap fm-app-main">
    <NuxtLink to="/properties" class="mo-muted">← All properties</NuxtLink>

    <v-alert v-if="error" type="error" variant="tonal" class="my-4" role="alert">{{ error }}</v-alert>
    <p v-if="loading" role="status" class="fm-balance-label mt-4">Loading…</p>

    <template v-else-if="d">
      <template v-if="d.property.images.length">
        <img :src="d.property.images[photo] || d.property.images[0]" alt="" class="mo-pd-img" />
        <div v-if="d.property.images.length > 1" class="mo-pd-thumbs">
          <button
            v-for="(u, n) in d.property.images"
            :key="u"
            type="button"
            :class="{ on: n === photo }"
            :aria-label="`Photo ${n + 1}`"
            @click="photo = n"
          >
            <img :src="u" alt="" loading="lazy" />
          </button>
        </div>
      </template>
      <h1 class="fm-page-title mt-4">{{ d.property.title }}</h1>
      <p v-if="d.property.location" class="mo-muted">{{ d.property.location }}</p>
      <p v-if="d.property.description" class="mt-3" style="white-space: pre-line">{{ d.property.description }}</p>

      <section v-if="d.property.stage" class="mo-card mt-4">
        <h2>Project stage</h2>
        <ol class="mo-stages">
          <li
            v-for="(st, n) in PROPERTY_STAGES"
            :key="st"
            :class="{ done: n < stageIndex, now: n === stageIndex }"
          >
            <span class="dot">{{ n < stageIndex ? '✓' : n + 1 }}</span>
            <span>{{ st }}</span>
          </li>
        </ol>
        <div v-if="d.property.stageLog.length" class="mt-3">
          <p v-for="(e, n) in [...d.property.stageLog].reverse()" :key="n" class="mo-muted">
            {{ new Date(e.at).toLocaleDateString(undefined, { dateStyle: 'medium' }) }} · <strong>{{ e.stage }}</strong>
            <template v-if="e.note"> — {{ e.note }}</template>
          </p>
        </div>
      </section>

      <section class="mo-card mt-4">
        <div class="mo-pd-bar" aria-hidden="true"><div :style="{ width: pct + '%' }"></div></div>
        <p class="mo-pd-nums">
          <strong>{{ fmt(d.chain.raised) }}</strong> of {{ fmt(d.chain.target) }} USDC raised ({{ pct }}%)
        </p>
        <p class="mo-muted">
          Status: <strong>{{ statusText }}</strong>
          <template v-if="d.chain.status === 'open'"> · closes {{ deadlineText }}</template>
        </p>
        <p v-if="d.property.propertyPriceUsdc" class="mo-muted">
          Full property price: {{ fmt(String(d.property.propertyPriceUsdc)) }} USDC. This pool raises {{ fmt(d.chain.target) }} USDC of it.
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
            maximum {{ d.property.maxInvestUsdc }} USDC per investment.
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

      <section v-if="d.admin" class="mo-card mt-8">
        <h2>Edit this listing (admin)</h2>
        <v-alert v-if="editMsg" :type="editOk ? 'success' : 'error'" variant="tonal" class="mb-3">{{ editMsg }}</v-alert>
        <v-form @submit.prevent="saveEdit">
          <v-text-field v-model="edit.title" label="Title" />
          <v-text-field v-model="edit.location" label="Location" />
          <label class="mo-prop-field">
            <span>Description</span>
            <textarea v-model="edit.description" rows="5"></textarea>
          </label>
          <PropertyPhotos v-model="edit.images" />
          <v-text-field v-model="edit.expectedReturn" label="Expected return (text shown to people)" />
          <v-text-field v-model="edit.minInvestUsdc" label="Minimum investment (USDC)" inputmode="decimal" />
          <v-text-field
            v-model="edit.maxInvestUsdc"
            label="Maximum per investment (USDC, empty = app limit)"
            inputmode="decimal"
            :hint="`The app-wide ceiling is ${d.pool.maxCeilingUsdc} USDC and cannot be exceeded.`"
            persistent-hint
            class="mb-4"
          />
          <v-text-field
            v-model="edit.propertyPriceUsdc"
            label="Full property price (USDC, shown for information)"
            inputmode="decimal"
            class="mb-2"
          />
          <v-select v-model="edit.stage" :items="[...PROPERTY_STAGES]" label="Project stage" clearable />
          <v-text-field
            v-if="edit.stage && edit.stage !== d.property.stage"
            v-model="edit.stageNote"
            label="Note for this stage update (optional)"
          />
          <div class="d-flex ga-2 flex-wrap">
            <v-btn type="submit" color="primary" variant="flat" :loading="saving">Save changes</v-btn>
            <v-btn variant="outlined" color="error" :loading="removing" @click="removeListing">Remove listing</v-btn>
          </div>
        </v-form>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { PROPERTY_STAGES } from '~/utils/propertyStages'
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
const photo = ref(0)
const saving = ref(false)
const removing = ref(false)
const editMsg = ref('')
const editOk = ref(false)
const edit = reactive({
  title: '',
  location: '',
  description: '',
  images: [] as string[],
  expectedReturn: '',
  minInvestUsdc: '10',
  maxInvestUsdc: '',
  propertyPriceUsdc: '',
  stage: '' as string | null,
  stageNote: '',
})
const stageIndex = computed(() => (PROPERTY_STAGES as readonly string[]).indexOf(d.value?.property.stage))
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

function fillEdit() {
  const p = d.value.property
  edit.title = p.title
  edit.location = p.location
  edit.description = p.description
  edit.images = [...p.images]
  edit.expectedReturn = p.expectedReturn
  edit.minInvestUsdc = String(p.minInvestUsdc)
  edit.maxInvestUsdc = p.maxInvestSetting ? String(p.maxInvestSetting) : ''
  edit.propertyPriceUsdc = p.propertyPriceUsdc ? String(p.propertyPriceUsdc) : ''
  edit.stage = p.stage || ''
  edit.stageNote = ''
}

async function load(refillEdit = false) {
  d.value = await api(`/api/properties/${id}`)
  if (photo.value >= d.value.property.images.length) photo.value = 0
  if (refillEdit || !edit.title) fillEdit()
}

async function saveEdit() {
  editMsg.value = ''
  saving.value = true
  try {
    await api('/api/properties/update', {
      method: 'POST',
      body: {
        id,
        title: edit.title,
        location: edit.location,
        description: edit.description,
        images: edit.images,
        expectedReturn: edit.expectedReturn,
        minInvestUsdc: Number(edit.minInvestUsdc),
        maxInvestUsdc: edit.maxInvestUsdc,
        propertyPriceUsdc: edit.propertyPriceUsdc,
        stage: edit.stage || '',
        stageNote: edit.stageNote,
      },
    })
    await load(true)
    editOk.value = true
    editMsg.value = 'Saved.'
  } catch (err: any) {
    editOk.value = false
    editMsg.value = errorText(err)
  } finally {
    saving.value = false
  }
}

async function removeListing() {
  if (!window.confirm('Remove this listing from the app? This cannot be undone.')) return
  editMsg.value = ''
  removing.value = true
  try {
    await api('/api/properties/delete', { method: 'POST', body: { id } })
    await navigateTo('/properties')
  } catch (err: any) {
    editOk.value = false
    editMsg.value = errorText(err)
  } finally {
    removing.value = false
  }
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
.mo-pd-thumbs { display: flex; gap: 8px; margin-top: 8px; overflow-x: auto; }
.mo-pd-thumbs button { border: 2px solid transparent; border-radius: 8px; padding: 0; background: none; cursor: pointer; flex: 0 0 auto; }
.mo-pd-thumbs button.on { border-color: #ff4b33; }
.mo-pd-thumbs img { display: block; width: 72px; height: 54px; object-fit: cover; border-radius: 6px; }
.mo-stages { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 8px; }
.mo-stages li { display: flex; align-items: center; gap: 10px; opacity: 0.55; }
.mo-stages li.done, .mo-stages li.now { opacity: 1; }
.mo-stages .dot { width: 26px; height: 26px; border-radius: 50%; border: 1px solid rgba(128,128,128,0.6); display: inline-flex; align-items: center; justify-content: center; font-size: 0.8rem; }
.mo-stages li.done .dot { background: #2e7d32; border-color: #2e7d32; color: #fff; }
.mo-stages li.now .dot { background: #ff4b33; border-color: #ff4b33; color: #fff; }
.mo-stages li.now { font-weight: 600; }
.mo-prop-field { display: block; margin-bottom: 16px; }
.mo-prop-field span { display: block; font-size: 0.85rem; margin-bottom: 6px; opacity: 0.8; }
.mo-prop-field textarea { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid rgba(128,128,128,0.5); background: transparent; color: inherit; font: inherit; }
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
