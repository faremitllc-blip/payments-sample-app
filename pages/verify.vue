<template>
  <div class="mo-bank">
    <h1 class="fm-page-title">Verify your identity</h1>
    <p class="fm-lede">
      A quick check required before you can get bank details. Your documents go
      to our verification partner and are not stored by {{ appName }}.
    </p>

    <v-alert
      v-if="error"
      type="error"
      variant="tonal"
      class="my-4"
      role="alert"
    >
      {{ error }}
    </v-alert>

    <p v-if="loading" role="status" class="fm-balance-label mt-4">Loading…</p>

    <section v-else-if="!status" class="mo-card mo-empty-card mt-4">
      <h2>Start your verification first</h2>
      <p class="mo-muted mt-2 mb-4">
        Tell us your name on the bank accounts page and we will bring you back
        here.
      </p>
      <v-btn to="/bank" color="primary" variant="flat">Go to bank accounts</v-btn>
    </section>

    <section v-else-if="status.approved" class="mo-card mo-empty-card mt-4">
      <h2>You are verified</h2>
      <p class="mo-muted mt-2 mb-4">
        Thank you. You can open your bank accounts now.
      </p>
      <v-btn to="/bank" color="primary" variant="flat">Open bank accounts</v-btn>
    </section>

    <template v-else>
      <v-alert
        v-if="returned"
        type="info"
        variant="tonal"
        class="mt-4"
      >
        Thanks. We are checking what you sent. This page updates by itself.
      </v-alert>

      <section class="mo-card mt-4">
        <div class="mo-card-head">
          <h2>Your progress</h2>
          <span class="mo-muted">{{ headline }}</span>
        </div>
        <ol class="mo-bank-steps">
          <li>
            <div>
              <strong>1. Accept the terms</strong>
              <span class="mo-muted">
                {{ status.tosStatus === 'approved' ? 'Done' : 'Not done yet' }}
              </span>
            </div>
            <v-btn
              v-if="status.tosStatus !== 'approved' && status.tosLink"
              :href="status.tosLink"
              target="_blank"
              rel="noopener"
              variant="outlined"
              color="secondary"
            >
              Open terms
            </v-btn>
          </li>
          <li>
            <div>
              <strong>2. Verify your identity</strong>
              <span class="mo-muted">{{ kycText }}</span>
            </div>
          </li>
        </ol>
        <div class="mo-bank-row mt-4">
          <v-btn color="primary" variant="flat" :loading="busy" @click="check">
            Check my status
          </v-btn>
          <v-btn
            v-if="status.kycLink"
            :href="status.kycLink"
            target="_blank"
            rel="noopener"
            variant="text"
            color="secondary"
          >
            Open in a new tab instead
          </v-btn>
        </div>
      </section>

      <section v-if="showFrame" class="mo-card mt-4">
        <div class="mo-card-head">
          <h2>Identity check</h2>
          <span class="mo-muted">Secure verification</span>
        </div>
        <iframe
          class="mo-frame"
          title="Identity check"
          :src="frameSrc"
          allow="camera; microphone; fullscreen"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-top-navigation-by-user-activation"
        ></iframe>
        <p class="mo-muted mt-3">
          If the check does not load here, use "Open in a new tab instead"
          above. Your progress is saved either way.
        </p>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { APP_NAME, errorText } from '~/composables/useAuth'
import { kycHeadline } from '~/utils/bank'

definePageMeta({ layout: 'dash', middleware: 'auth' })
useHead({ title: 'Verify your identity' })

const appName = APP_NAME
const route = useRoute()
const { status, load } = useBank()

const loading = ref(true)
const busy = ref(false)
const error = ref('')
let timer: ReturnType<typeof setInterval> | null = null

const returned = computed(() => route.query.done === '1')

const headline = computed(() =>
  status.value
    ? kycHeadline(status.value.kycStatus, status.value.tosStatus, status.value.approved)
    : '',
)

const kycText = computed(() => {
  switch (status.value?.kycStatus) {
    case 'approved':
      return 'Done'
    case 'under_review':
      return 'Being reviewed. This can take a little while.'
    case 'incomplete':
      return 'Some details are missing. Finish them below.'
    case 'rejected':
      return 'Not approved'
    default:
      return 'Not done yet'
  }
})

const showFrame = computed(
  () =>
    !!status.value?.kycLink &&
    status.value.kycStatus !== 'approved' &&
    status.value.kycStatus !== 'under_review' &&
    status.value.kycStatus !== 'rejected',
)

const frameSrc = computed(() => {
  const link = status.value?.kycLink || ''
  if (!link || !import.meta.client) {
    return ''
  }
  const joiner = link.includes('?') ? '&' : '?'
  return `${link}${joiner}iframe-origin=${encodeURIComponent(window.location.origin)}`
})

async function refresh() {
  await load()
  if (status.value?.approved) {
    await navigateTo('/bank')
  }
}

async function check() {
  error.value = ''
  busy.value = true
  try {
    await refresh()
  } catch (err: any) {
    error.value = errorText(err)
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  try {
    await refresh()
  } catch (err: any) {
    error.value = errorText(err)
  } finally {
    loading.value = false
  }
  // Keep the page current while the person finishes the check.
  timer = setInterval(() => {
    if (!status.value?.approved) {
      refresh().catch(() => {})
    }
  }, 10_000)
})

onBeforeUnmount(() => {
  if (timer) {
    clearInterval(timer)
  }
})
</script>
