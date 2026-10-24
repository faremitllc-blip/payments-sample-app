<template>
  <div class="mo-prof">
    <h1 class="fm-page-title">Profile</h1>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4" role="alert">
      {{ error }}
    </v-alert>

    <section class="mo-card mo-prof-photo">
      <span class="mo-avatar-xl" :class="{ 'has-photo': !!photo }">
        <img v-if="photo" :src="photo" alt="Your profile photo" />
        <span v-else aria-hidden="true">{{ initial }}</span>
      </span>

      <div class="mo-prof-photo-text">
        <h2>{{ shownName }}</h2>
        <p class="mo-muted">{{ profile?.email || session?.email }}</p>
        <div class="mo-prof-buttons">
          <v-btn
            color="primary"
            variant="flat"
            prepend-icon="mdi-camera-outline"
            :loading="uploading"
            @click="pick"
          >
            {{ photo ? 'Change photo' : 'Add photo' }}
          </v-btn>
          <v-btn
            v-if="photo"
            variant="outlined"
            color="secondary"
            :disabled="uploading"
            @click="removePhoto"
          >
            Remove
          </v-btn>
        </div>
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          class="mo-sr"
          tabindex="-1"
          aria-label="Choose a profile photo"
          @change="onFile"
        />
        <p class="mo-muted mo-prof-hint">
          Pick any photo. It is cropped to a square and made small before it is
          saved.
        </p>
      </div>
    </section>

    <section class="mo-card">
      <div class="mo-card-head"><h2>Your details</h2></div>
      <v-form class="mo-prof-form" @submit.prevent="saveName">
        <v-text-field
          v-model="name"
          label="Display name"
          variant="outlined"
          maxlength="60"
          autocomplete="name"
          hint="Shown in your greeting and on your profile."
          persistent-hint
        />
        <v-text-field
          :model-value="profile?.email || session?.email || ''"
          label="Email"
          variant="outlined"
          readonly
          hint="Your sign-in email. It can't be changed here."
          persistent-hint
        />
        <div class="mo-prof-buttons">
          <v-btn
            type="submit"
            color="primary"
            variant="flat"
            :loading="savingName"
            :disabled="!nameChanged"
          >
            Save
          </v-btn>
          <span v-if="savedNote" class="mo-saved" role="status">
            <v-icon size="18" aria-hidden="true">mdi-check-circle</v-icon>
            {{ savedNote }}
          </span>
        </div>
      </v-form>
    </section>

    <div class="mo-prof-pair">
      <section v-if="bankConfigured" id="identity" class="mo-card mo-anchor">
        <div class="mo-card-head">
          <h2>Identity check</h2>
          <span class="mo-status" :class="kycChip.className">{{ kycChip.text }}</span>
        </div>
        <p class="mo-muted">
          A one-time check that unlocks your USD, EUR and GBP bank accounts.
        </p>
        <v-btn to="/kyc" variant="outlined" color="secondary" class="mt-4">
          See my KYC status
        </v-btn>
      </section>

      <section class="mo-card">
        <div class="mo-card-head"><h2>Wallet</h2></div>
        <template v-if="wallet">
          <p class="mo-prof-addr">{{ shortAddress(wallet.address) }}</p>
          <p class="mo-muted">{{ networkName(wallet.blockchain) }}</p>
          <v-btn to="/receive" variant="outlined" color="secondary" class="mt-4">
            Show my address
          </v-btn>
        </template>
        <template v-else>
          <p class="mo-muted">You don't have a wallet yet.</p>
          <v-btn to="/wallet" variant="outlined" color="secondary" class="mt-4">
            Go to my dashboard
          </v-btn>
        </template>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { errorText, useAuth } from '~/composables/useAuth'
import { networkName, shortAddress, useWallet } from '~/composables/useWallet'
import { squareAvatar } from '~/utils/avatar'
import { kycHeadline } from '~/utils/bank'

definePageMeta({ layout: 'dash', middleware: 'auth' })
useHead({ title: 'Profile' })

const { session } = useAuth()
const { profile, load, save } = useProfile()
const { wallet, loadWallet } = useWallet()
const { configured: bankConfigured, status: bankStatus, load: loadBank } = useBank()

const route = useRoute()
const error = ref('')
const name = ref('')
const savingName = ref(false)
const uploading = ref(false)
const savedNote = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const photo = computed(() => profile.value?.avatar || '')
const savedName = computed(() => profile.value?.displayName || '')
const nameChanged = computed(() => name.value.trim() !== savedName.value)

const shownName = computed(() => {
  if (savedName.value) {
    return savedName.value
  }
  const local = (session.value?.email || '').split('@')[0]
  return local || 'Your profile'
})
const initial = computed(() => (shownName.value.charAt(0) || '?').toUpperCase())

const kycChip = computed(() => {
  const s = bankStatus.value
  if (!s) {
    return { text: 'Not started', className: 'is-none' }
  }
  const text = kycHeadline(s.kycStatus, s.tosStatus, s.approved)
  return {
    text,
    className: s.approved ? 'is-complete' : s.kycStatus === 'rejected' ? 'is-failed' : '',
  }
})

function flash(text: string) {
  savedNote.value = text
  setTimeout(() => {
    savedNote.value = ''
  }, 3000)
}

function pick() {
  fileInput.value?.click()
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) {
    return
  }
  error.value = ''
  uploading.value = true
  let avatar = ''
  try {
    avatar = await squareAvatar(file)
  } catch (err: any) {
    error.value = String(err?.message || 'That photo could not be used.')
    uploading.value = false
    return
  }
  try {
    await save({ avatar })
    flash('Photo saved')
  } catch (err: any) {
    error.value = errorText(err)
  } finally {
    uploading.value = false
  }
}

async function removePhoto() {
  error.value = ''
  uploading.value = true
  try {
    await save({ avatar: null })
    flash('Photo removed')
  } catch (err: any) {
    error.value = errorText(err)
  } finally {
    uploading.value = false
  }
}

async function saveName() {
  error.value = ''
  savingName.value = true
  try {
    await save({ displayName: name.value.trim() })
    name.value = profile.value?.displayName || ''
    flash('Saved')
  } catch (err: any) {
    error.value = errorText(err)
  } finally {
    savingName.value = false
  }
}

onMounted(async () => {
  try {
    await load()
    name.value = profile.value?.displayName || ''
  } catch (err: any) {
    error.value = errorText(err)
  }
  loadWallet().catch(() => undefined)
  loadBank()
    .catch(() => undefined)
    .finally(scrollToHash)
})

// "Identity check" in the menu opens this page at the ID status card.
function scrollToHash() {
  if (route.hash !== '#identity') {
    return
  }
  nextTick(() => {
    document.getElementById('identity')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}
watch(() => route.hash, scrollToHash)
</script>

