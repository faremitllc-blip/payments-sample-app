<template>
  <div>
    <v-alert
      v-if="error"
      type="error"
      variant="tonal"
      class="mb-4"
      role="alert"
    >
      {{ error }}
    </v-alert>

    <p v-if="loading" role="status" class="fm-balance-label">
      Loading your wallet…
    </p>

    <div v-else-if="!wallet" class="mo-card mo-empty-card">
      <h1 class="fm-page-title">Welcome, {{ displayName }}!</h1>
      <p class="fm-lede">
        One tap gives you a USDC wallet and an address you can share to get
        paid.
      </p>
      <v-btn
        size="x-large"
        color="primary"
        variant="flat"
        class="mt-6"
        :loading="creating"
        @click="create"
      >
        Create wallet
      </v-btn>
    </div>

    <div v-else class="mo-dash">
      <h1 class="mo-sr">Dashboard</h1>
      <div class="mo-dash-main">
        <NuxtLink v-if="mode.loaded && mode.agent" to="/assistant" class="mo-insight">
          <AgentOrb size="xs" />
          <span class="mo-insight-text">
            <strong>Ask Mondo AI</strong>
            <span>Check your balance, sum up the month or send money, just by chatting.</span>
          </span>
          <v-icon size="22" aria-hidden="true">mdi-chevron-right</v-icon>
        </NuxtLink>

        <div class="mo-row-top">
          <section class="mo-card mo-summary">
            <div class="mo-card-head">
              <h2>Monthly summary</h2>
              <ul class="mo-legend" aria-label="Chart legend">
                <li><span class="mo-dot mo-dot-in"></span>Received</li>
                <li><span class="mo-dot mo-dot-sent"></span>Sent</li>
              </ul>
            </div>
            <div
              class="mo-bars"
              role="img"
              :aria-label="`Received and sent each month over the last six months. This month: received ${formatUsdc(stats.received)} USDC, sent ${formatUsdc(stats.sent)} USDC.`"
            >
              <div v-for="(label, i) in months.labels" :key="label + i" class="mo-bar-col">
                <div class="mo-bar-pair">
                  <span
                    class="mo-bar-in"
                    :style="{ height: barHeight(months.received[i]) }"
                  ></span>
                  <span
                    class="mo-bar-sent"
                    :style="{ height: barHeight(months.sent[i]) }"
                  ></span>
                </div>
                <span class="mo-bar-label">{{ label }}</span>
              </div>
            </div>
          </section>

          <RingStat
            label="Received"
            icon="mdi-arrow-bottom-left"
            tone="in"
            :amount="formatUsdc(stats.received)"
            :fill="ringFill(stats.received, bestMonth)"
            :change="receivedChange"
          />
          <RingStat
            label="Sent"
            icon="mdi-arrow-top-right"
            tone="out"
            :amount="formatUsdc(stats.sent)"
            :fill="ringFill(stats.sent, bestMonth)"
            :change="sentChange"
          />
        </div>

        <section class="mo-card mo-overview">
          <div class="mo-card-head">
            <h2>Overview</h2>
            <div class="mo-toggle" role="group" aria-label="Chart period">
              <button
                type="button"
                :class="{ 'is-on': period === 'weeks' }"
                :aria-pressed="period === 'weeks'"
                @click="period = 'weeks'"
              >
                8 weeks
              </button>
              <button
                type="button"
                :class="{ 'is-on': period === 'months' }"
                :aria-pressed="period === 'months'"
                @click="period = 'months'"
              >
                6 months
              </button>
            </div>
          </div>
          <OverviewChart
            :labels="chart.labels"
            :received="chart.received"
            :sent="chart.sent"
            :unit="period"
          />
        </section>

        <section class="mo-card mo-tx">
          <div class="mo-card-head">
            <h2>Transactions</h2>
            <NuxtLink to="/activity">See all</NuxtLink>
          </div>
          <TxTable :items="activity.slice(0, 6)" />
          <p class="mo-muted mo-foot">
            The chart and totals use your latest 50 transfers. Failed transfers
            are not counted.
          </p>
        </section>
      </div>

      <aside class="mo-dash-side">
        <section class="mo-card mo-wallet-card-wrap">
          <div class="mo-card-head">
            <h2>Your wallet</h2>
            <v-btn
              size="small"
              variant="text"
              color="secondary"
              :loading="refreshing"
              @click="refresh"
            >
              Refresh
            </v-btn>
          </div>

          <div class="mo-wallet">
            <div class="mo-wallet-top">
              <span class="mo-wallet-mark" aria-hidden="true">M</span>
              <span class="mo-wallet-net">{{ networkName(wallet.blockchain) }}</span>
            </div>
            <div class="mo-wallet-main">
              <p class="mo-wallet-label">USDC balance</p>
              <p class="mo-wallet-balance">{{ formatUsdc(usdc) }}</p>
            </div>
            <div class="mo-wallet-bottom">
              <div class="mo-wallet-who">
                <p class="mo-wallet-label">Name</p>
                <p class="mo-wallet-value">{{ displayName }}</p>
              </div>
              <div class="mo-wallet-addr">
                <p class="mo-wallet-label">Address</p>
                <p class="mo-wallet-value">{{ shortAddress(wallet.address) }}</p>
              </div>
              <button
                type="button"
                class="mo-wallet-copy"
                :aria-label="copied ? 'Address copied' : 'Copy wallet address'"
                @click="copy(wallet.address)"
              >
                <v-icon size="20">{{ copied ? 'mdi-check' : 'mdi-content-copy' }}</v-icon>
              </button>
            </div>
          </div>

          <div class="mo-wallet-actions">
            <v-btn to="/send" color="primary" variant="flat">Send</v-btn>
            <v-btn to="/receive" color="secondary" variant="outlined">
              Receive
            </v-btn>
          </div>
        </section>

        <section v-if="bankConfigured" class="mo-card">
          <div class="mo-card-head">
            <h2>Your bank accounts</h2>
          </div>
          <ul class="mo-bank-list" aria-label="Your bank accounts">
            <li v-for="item in bankSummary" :key="item.code">
              <span class="mo-bank-code">{{ item.code }}</span>
              <span class="mo-bank-name">{{ item.name }}</span>
              <span class="mo-status" :class="item.open ? 'is-complete' : 'is-none'">
                {{ item.open ? 'Open' : 'Not opened' }}
              </span>
            </li>
          </ul>
          <v-btn to="/bank" color="primary" variant="flat" block class="mt-4">
            {{ anyBankOpen ? 'Manage bank accounts' : 'Open a bank account' }}
          </v-btn>
        </section>

        <section class="mo-card mo-setup">
          <div class="mo-card-head">
            <h2>Set-up progress</h2>
            <span class="mo-chip-soft">{{ setupDone }} of {{ setup.length }}</span>
          </div>
          <div
            class="mo-progress"
            role="progressbar"
            aria-label="Set-up progress"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="setupPercent"
          >
            <span :style="{ width: setupPercent + '%' }"></span>
          </div>
          <ul class="mo-checks">
            <li v-for="step in setup" :key="step.label" :class="{ 'is-done': step.done }">
              <v-icon size="20" aria-hidden="true">
                {{ step.done ? 'mdi-check-circle' : 'mdi-circle-outline' }}
              </v-icon>
              <NuxtLink v-if="step.to && !step.done" :to="step.to">{{ step.label }}</NuxtLink>
              <span v-else>{{ step.label }}</span>
            </li>
          </ul>
        </section>

        <p v-if="mode.loaded && !mode.live" class="fm-notice">
          Need test USDC? Get some free from the
          <a href="https://faucet.circle.com" target="_blank" rel="noopener">
            Circle faucet</a
          >. Choose the network shown above and paste your address.
        </p>
        <p v-else-if="mode.loaded" class="fm-notice">
          To add money, send USDC to your address. Use the network shown, or the
          funds may be lost.
        </p>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { errorText, useAuth } from '~/composables/useAuth'
import { useCopy } from '~/composables/useCopy'
import {
  formatUsdc,
  networkName,
  shortAddress,
  useWallet,
} from '~/composables/useWallet'
import {
  monthTotals,
  monthlySeries,
  percentChange,
  ringFill,
  weeklySeries,
} from '~/utils/activityStats'

definePageMeta({ layout: 'dash', middleware: 'auth' })
useHead({ title: 'Dashboard' })

const { session } = useAuth()
const { mode, loadMode } = useAppMode()
loadMode()
const {
  wallet,
  walletLoaded,
  usdc,
  activity,
  loadDashboard,
  createWallet,
} = useWallet()
const { copied, copy } = useCopy()
const {
  configured: bankConfigured,
  accounts: bankAccounts,
  status: bankStatus,
  load: loadBank,
} = useBank()

const bankSummary = computed(() =>
  (
    [
      { currency: 'usd', name: 'US dollar' },
      { currency: 'eur', name: 'Euro' },
      { currency: 'gbp', name: 'British pound' },
    ] as const
  ).map((entry) => ({
    code: entry.currency.toUpperCase(),
    name: entry.name,
    open: bankAccounts.value.some((a) => a.currency === entry.currency),
  })),
)
const anyBankOpen = computed(() => bankSummary.value.some((b) => b.open))

// Show what we already have right away and refresh it in the background.
const loading = ref(!walletLoaded.value)
const creating = ref(false)
const refreshing = ref(false)
const error = ref('')
const now = ref(new Date())
const period = ref<'weeks' | 'months'>('weeks')

// "jane.doe42@mail.com" becomes "Jane"
const { profile } = useProfile()
const displayName = computed(() => {
  if (profile.value?.displayName) {
    return profile.value.displayName.split(' ')[0]
  }
  const local = (session.value?.email || '').split('@')[0]
  const first = local.split(/[._\-+0-9]+/)[0]
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : 'there'
})

const stats = computed(() => monthTotals(activity.value, now.value))
const months = computed(() => monthlySeries(activity.value, now.value, 6))
const weeks = computed(() => weeklySeries(activity.value, now.value, 8))
const chart = computed(() => (period.value === 'weeks' ? weeks.value : months.value))

const bestMonth = computed(() =>
  Math.max(0, ...months.value.received, ...months.value.sent),
)

function barHeight(value: number): string {
  if (bestMonth.value <= 0 || value <= 0) {
    return '4px'
  }
  return `${Math.max(4, Math.round((value / bestMonth.value) * 100))}%`
}

const receivedChange = computed(() => {
  const list = months.value.received
  return percentChange(list[list.length - 1], list[list.length - 2])
})
const sentChange = computed(() => {
  const list = months.value.sent
  return percentChange(list[list.length - 1], list[list.length - 2])
})

const setup = computed(() => {
  const steps: Array<{ label: string; done: boolean; to?: string }> = [
    { label: 'Create your wallet', done: !!wallet.value },
  ]
  if (bankConfigured.value) {
    steps.push({
      label: 'Verify your identity',
      done: !!bankStatus.value?.approved,
      to: '/kyc',
    })
    steps.push({
      label: 'Open a bank account',
      done: anyBankOpen.value,
      to: '/bank',
    })
  }
  steps.push({
    label: 'Add money to your wallet',
    done: Number(usdc.value) > 0,
    to: '/receive',
  })
  return steps
})
const setupDone = computed(() => setup.value.filter((s) => s.done).length)
const setupPercent = computed(() =>
  Math.round((setupDone.value / setup.value.length) * 100),
)

async function loadAll() {
  now.value = new Date()
  await loadDashboard()
  // The bank summary is a bonus. If it cannot load, the home screen still works.
  loadBank().catch(() => {})
}

async function create() {
  error.value = ''
  creating.value = true
  try {
    await createWallet()
  } catch (err: any) {
    error.value = errorText(err)
  } finally {
    creating.value = false
  }
}

async function refresh() {
  error.value = ''
  refreshing.value = true
  try {
    await loadAll()
  } catch (err: any) {
    error.value = errorText(err)
  } finally {
    refreshing.value = false
  }
}

onMounted(async () => {
  try {
    await loadAll()
  } catch (err: any) {
    error.value = errorText(err)
  } finally {
    loading.value = false
  }
})
</script>
