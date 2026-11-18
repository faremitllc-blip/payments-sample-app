<template>
  <div class="fm-wrap fm-app-main mo-install">
    <h1 class="fm-page-title">Install Mondo</h1>
    <p class="fm-lede">Add Mondo to your home screen to open it like an app, full screen and one tap away.</p>

    <v-alert v-if="installed" type="success" variant="tonal" class="my-4">Mondo is installed on this device.</v-alert>

    <section v-if="canPrompt && !installed" class="mo-card mo-step">
      <h2>Install now</h2>
      <p>Your browser can install Mondo with one tap.</p>
      <v-btn class="mo-grad" variant="flat" @click="install">Install Mondo</v-btn>
    </section>

    <section class="mo-card mo-step">
      <h2>iPhone and iPad (Safari)</h2>
      <ol>
        <li>Open <strong>{{ host }}</strong> in Safari.</li>
        <li>Tap the <strong>Share</strong> button.</li>
        <li>Choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.</li>
      </ol>
    </section>

    <section class="mo-card mo-step">
      <h2>Android (Chrome)</h2>
      <ol>
        <li>Open <strong>{{ host }}</strong> in Chrome.</li>
        <li>Tap the <strong>three dots</strong> menu.</li>
        <li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
      </ol>
    </section>

    <section class="mo-card mo-step">
      <h2>Computer (Chrome or Edge)</h2>
      <p>Click the install icon at the right end of the address bar, then <strong>Install</strong>.</p>
    </section>

    <v-btn variant="text" :to="session ? '/wallet' : '/login'">Continue to Mondo</v-btn>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'app' })
useHead({ title: 'Install the app' })

const { session, load } = useAuth()
load()
const host = ref('this site')
const canPrompt = ref(false)
const installed = ref(false)

function sync() {
  canPrompt.value = !!(window as any).__moInstall
}

async function install() {
  const ev = (window as any).__moInstall
  if (!ev) return
  ev.prompt()
  try {
    await ev.userChoice
  } catch {
    // Ignore.
  }
  ;(window as any).__moInstall = null
  sync()
}

function onInstalled() {
  installed.value = true
  sync()
}

onMounted(() => {
  host.value = location.host
  installed.value = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
  sync()
  window.addEventListener('mo-install-ready', sync)
  window.addEventListener('mo-installed', onInstalled)
})
onBeforeUnmount(() => {
  window.removeEventListener('mo-install-ready', sync)
  window.removeEventListener('mo-installed', onInstalled)
})
</script>

<style scoped>
.mo-install { max-width: 640px; padding-bottom: 48px; }
.mo-step { padding: 18px 20px; margin: 14px 0; }
.mo-step h2 { font-size: 1.05rem; margin: 0 0 8px; }
.mo-step ol { padding-left: 20px; line-height: 1.7; margin: 0; }
.mo-grad.v-btn { background: linear-gradient(135deg, #2554e8 0%, #ff4b33 100%) !important; color: #fff !important; }
</style>
