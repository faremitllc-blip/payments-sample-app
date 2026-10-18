<template>
  <div class="mo-ai" :class="{ 'is-chat': hasChat }">
    <div v-if="hasChat" class="mo-ai-bar">
      <span class="mo-ai-title">
        <AgentOrb size="xs" :busy="busy" />
        {{ appName }} assistant
      </span>
      <button type="button" class="mo-ai-new" @click="startOver">
        <v-icon size="18" aria-hidden="true">mdi-plus</v-icon> New chat
      </button>
    </div>

    <div v-if="!hasChat" class="mo-ai-hero">
      <AgentOrb size="lg" />
      <p class="mo-ai-hi">Hey, {{ displayName }}!</p>
      <h1 class="mo-ai-ask">How can I help you today?</h1>
    </div>

    <div v-else class="mo-ai-thread" role="log" aria-live="polite" aria-label="Conversation">
      <template v-for="turn in turns" :key="turn.key">
        <p v-if="turn.kind === 'user'" class="mo-msg is-user">{{ turn.text }}</p>
        <p v-else-if="turn.kind === 'ai'" class="mo-msg is-ai">{{ turn.text }}</p>
        <p v-else-if="turn.kind === 'look'" class="mo-look">
          <v-icon size="16" aria-hidden="true">mdi-creation</v-icon>{{ turn.text }}
        </p>
        <AgentAction
          v-else-if="turn.kind === 'action' && turn.id && decisions[turn.id]"
          :name="turn.name || ''"
          :input="turn.input || {}"
          :decision="decisions[turn.id]"
          :network="networkLabel"
          :live="mode.loaded && mode.live"
          :disabled="busy"
          @approve="approve"
          @decline="decline"
        />
      </template>

      <p v-if="busy" class="mo-msg is-ai mo-typing" role="status" aria-label="The assistant is thinking">
        <span></span><span></span><span></span>
      </p>

      <div v-if="error" class="mo-ai-error" role="alert">
        <p>{{ error }}</p>
        <v-btn size="small" variant="tonal" @click="retry">Try again</v-btn>
      </div>
      <div ref="end"></div>
    </div>

    <div v-if="!hasChat" class="mo-ai-chips">
      <button
        v-for="chip in chips"
        :key="chip.text"
        type="button"
        class="mo-chip-card"
        :disabled="!ready"
        @click="ask(chip.text)"
      >
        <v-icon size="22" aria-hidden="true">mdi-shimmer</v-icon>
        <span>{{ chip.label }}</span>
      </button>
    </div>

    <p v-if="mode.loaded && !mode.agent" class="mo-ai-off" role="status">
      The assistant isn't switched on yet. The site owner needs to add the
      Gemini key.
    </p>
    <p v-else-if="full" class="mo-ai-off" role="status">
      This chat is getting long. Start a new chat to keep going.
    </p>

    <form class="mo-ai-input" @submit.prevent="submit">
      <label class="mo-sr" for="mo-ai-text">Ask anything</label>
      <input
        id="mo-ai-text"
        v-model="draft"
        type="text"
        maxlength="2000"
        autocomplete="off"
        placeholder="Ask anything"
        :disabled="!ready || full"
      />
      <button
        type="submit"
        class="mo-send"
        aria-label="Send"
        :disabled="!ready || full || busy || !draft.trim()"
      >
        <v-icon size="22" aria-hidden="true">mdi-send</v-icon>
      </button>
    </form>

    <p class="mo-ai-fine">
      Mondo AI can make mistakes. It only changes anything after you approve.
    </p>
  </div>
</template>

<script setup lang="ts">
import { APP_NAME, useAuth } from '~/composables/useAuth'
import { networkName, useWallet } from '~/composables/useWallet'

definePageMeta({ layout: 'dash', middleware: 'auth' })
useHead({ title: 'Assistant' })

const appName = APP_NAME
const { session } = useAuth()
const { mode, loadMode } = useAppMode()
loadMode()
const { wallet, loadWallet } = useWallet()
const { turns, decisions, busy, error, full, messages, send, retry, approve, decline, reset } =
  useAgent()

const draft = ref('')
const end = ref<HTMLElement | null>(null)

const hasChat = computed(() => messages.value.length > 0)
const ready = computed(() => !(mode.value.loaded && !mode.value.agent))
const networkLabel = computed(() => (wallet.value ? networkName(wallet.value.blockchain) : ''))

const { profile } = useProfile()
const displayName = computed(() => {
  if (profile.value?.displayName) {
    return profile.value.displayName.split(' ')[0]
  }
  const local = (session.value?.email || '').split('@')[0]
  const first = local.split(/[._\-+0-9]+/)[0]
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : 'there'
})

const chips = [
  { label: "What's my balance and how has this month gone?", text: "What's my balance, and how has this month gone?" },
  { label: 'Summarise my recent activity for me', text: 'Summarise my recent activity.' },
  { label: 'I want to send USDC to someone', text: 'I want to send USDC to someone.' },
  { label: 'Help me set up my bank accounts', text: 'Help me set up my bank accounts.' },
]

async function ask(text: string) {
  await send(text)
}

async function submit() {
  const text = draft.value
  if (!text.trim() || busy.value) {
    return
  }
  draft.value = ''
  await send(text)
}

function startOver() {
  reset()
  draft.value = ''
}

watch(
  () => [turns.value.length, busy.value, error.value],
  async () => {
    await nextTick()
    end.value?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  },
)

onMounted(() => {
  loadWallet().catch(() => undefined)
})
</script>
