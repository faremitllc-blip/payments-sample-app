<template>
  <div class="fm-wrap fm-app-main">
    <h1 class="fm-page-title">Properties</h1>
    <p class="fm-lede">
      Pool USDC with other people to fund a property. Each owner holds a share
      in proportion to what they put in, and rent or sale profit is paid out the
      same way.
    </p>

    <v-alert v-if="error" type="error" variant="tonal" class="my-4" role="alert">{{ error }}</v-alert>
    <p v-if="loading" role="status" class="fm-balance-label">Loading…</p>

    <template v-else-if="data">
      <div v-if="!data.enabled" class="fm-list">
        <div class="fm-empty">
          <h3>Not available yet</h3>
          <p>Property investing has not been switched on.</p>
        </div>
      </div>

      <template v-else>
        <p class="mo-prop-network">
          Investments are made in USDC on <strong>{{ data.poolChainLabel }}</strong>.
        </p>

        <div v-if="!data.properties.length" class="fm-list">
          <div class="fm-empty"><h3>No properties listed yet</h3></div>
        </div>

        <div class="mo-prop-grid">
          <NuxtLink
            v-for="p in data.properties"
            :key="p.id"
            :to="`/properties/${p.id}`"
            class="mo-prop-card"
          >
            <img v-if="p.imageUrl" :src="p.imageUrl" alt="" class="mo-prop-img" loading="lazy" />
            <div class="mo-prop-body">
              <div class="mo-prop-top">
                <strong>{{ p.title }}</strong>
                <span v-if="p.chain" class="mo-status" :class="chip(p.chain.status).cls">
                  {{ chip(p.chain.status).text }}
                </span>
              </div>
              <p v-if="p.location" class="mo-muted">{{ p.location }}</p>
              <template v-if="p.chain">
                <div class="mo-prop-bar" aria-hidden="true">
                  <div :style="{ width: pct(p.chain) + '%' }"></div>
                </div>
                <p class="mo-prop-nums">
                  {{ fmt(p.chain.raised) }} of {{ fmt(p.chain.target) }} USDC · {{ pct(p.chain) }}%
                </p>
              </template>
              <p v-if="p.expectedReturn" class="mo-muted">{{ p.expectedReturn }}</p>
            </div>
          </NuxtLink>
        </div>

        <section v-if="data.admin" class="mo-card mt-8">
          <h2>List a property (admin)</h2>
          <p class="mo-muted mb-4">
            Create the property on the contract first, then enter its number here
            with the details people will see.
          </p>
          <v-alert v-if="adminMsg" :type="adminOk ? 'success' : 'error'" variant="tonal" class="mb-3">
            {{ adminMsg }}
          </v-alert>
          <v-form @submit.prevent="createListing">
            <v-text-field v-model="form.onchainId" label="Property number on the contract" inputmode="numeric" />
            <v-text-field v-model="form.title" label="Title" />
            <v-text-field v-model="form.location" label="Location" />
            <label class="mo-prop-field">
              <span>Description</span>
              <textarea v-model="form.description" rows="4"></textarea>
            </label>
            <v-text-field v-model="form.imageUrl" label="Image link (https://…)" />
            <v-text-field v-model="form.expectedReturn" label="Expected return (text shown to people)" />
            <v-text-field v-model="form.minInvestUsdc" label="Minimum investment (USDC)" inputmode="decimal" />
            <v-btn type="submit" color="primary" variant="flat" :loading="adminBusy">List property</v-btn>
          </v-form>
        </section>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dash', middleware: 'auth' })
useHead({ title: 'Properties' })

interface Chain {
  status: string
  target: string
  raised: string
  deadline: number
}
interface Listing {
  id: string
  title: string
  location: string
  imageUrl: string
  expectedReturn: string
  chain: Chain | null
}

const { api } = useAuth()
const loading = ref(true)
const error = ref('')
const data = ref<{
  enabled: boolean
  admin: boolean
  poolChainLabel?: string
  properties: Listing[]
} | null>(null)

const form = reactive({
  onchainId: '',
  title: '',
  location: '',
  description: '',
  imageUrl: '',
  expectedReturn: '',
  minInvestUsdc: '10',
})
const adminBusy = ref(false)
const adminMsg = ref('')
const adminOk = ref(false)

function fmt(v: string) {
  return Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 })
}
function pct(c: Chain) {
  const t = Number(c.target)
  return t > 0 ? Math.min(100, Math.floor((Number(c.raised) / t) * 100)) : 0
}
function chip(status: string) {
  const open = status === 'open'
  return {
    text: { open: 'Open', funded: 'Funded', failed: 'Not funded', closed: 'Sold' }[status] || status,
    cls: open || status === 'funded' ? 'is-complete' : status === 'failed' ? 'is-failed' : '',
  }
}

async function load() {
  data.value = await api('/api/properties')
}

async function createListing() {
  adminMsg.value = ''
  adminBusy.value = true
  try {
    await api('/api/properties/create', {
      method: 'POST',
      body: {
        onchainId: Number(form.onchainId),
        title: form.title,
        location: form.location,
        description: form.description,
        imageUrl: form.imageUrl,
        expectedReturn: form.expectedReturn,
        minInvestUsdc: Number(form.minInvestUsdc),
      },
    })
    adminOk.value = true
    adminMsg.value = 'Property listed.'
    form.onchainId = ''
    form.title = ''
    await load()
  } catch (err: any) {
    adminOk.value = false
    adminMsg.value = errorText(err)
  } finally {
    adminBusy.value = false
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

<style scoped>
.mo-prop-network {
  margin: 0 0 16px;
}
.mo-prop-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}
.mo-prop-card {
  display: block;
  border: 1px solid rgba(128, 128, 128, 0.3);
  border-radius: 12px;
  overflow: hidden;
  color: inherit;
  text-decoration: none;
}
.mo-prop-img {
  display: block;
  width: 100%;
  height: 160px;
  object-fit: cover;
}
.mo-prop-body {
  padding: 14px;
}
.mo-prop-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: flex-start;
}
.mo-prop-bar {
  height: 8px;
  border-radius: 4px;
  background: rgba(128, 128, 128, 0.25);
  margin: 12px 0 6px;
  overflow: hidden;
}
.mo-prop-bar div {
  height: 100%;
  background: #ff4b33;
}
.mo-prop-nums {
  margin: 0;
  font-size: 0.85rem;
}
.mo-prop-field {
  display: block;
  margin-bottom: 16px;
}
.mo-prop-field span {
  display: block;
  font-size: 0.85rem;
  margin-bottom: 6px;
  opacity: 0.8;
}
.mo-prop-field textarea {
  width: 100%;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid rgba(128, 128, 128, 0.5);
  background: transparent;
  color: inherit;
  font: inherit;
}
</style>
