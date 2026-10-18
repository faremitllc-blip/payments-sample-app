import { errorText, useAuth } from '~/composables/useAuth'
import { useBank } from '~/composables/useBank'
import { useWallet } from '~/composables/useWallet'

/**
 * The Mondo assistant, on the client side. The server only ever *proposes*
 * actions. They are run here, through the normal Mondo API, and only after the
 * user taps Approve. A mobile app can follow the same steps.
 */

export interface AgentBlock {
  type: 'text' | 'tool_use' | 'tool_result'
  text?: string
  id?: string
  name?: string
  input?: Record<string, string>
  tool_use_id?: string
  content?: string
  is_error?: boolean
}

export interface AgentMessage {
  role: 'user' | 'assistant'
  content: AgentBlock[]
  /** The model's own turn, kept untouched and sent back with the next request. */
  raw?: unknown
}

export type DecisionStatus = 'pending' | 'running' | 'done' | 'declined' | 'failed'

export interface Decision {
  status: DecisionStatus
  note: string
}

export interface Turn {
  key: string
  kind: 'user' | 'ai' | 'action' | 'look'
  text?: string
  id?: string
  name?: string
  input?: Record<string, string>
}

const ACTION_NAMES = [
  'create_wallet',
  'send_usdc',
  'start_identity_verification',
  'open_bank_account',
]

const LOOK_LABELS: Record<string, string> = {
  get_wallet: 'Looked at your wallet',
  get_balance: 'Checked your balance',
  get_recent_activity: 'Read your recent activity',
  get_month_summary: 'Added up this month',
  get_bank_overview: 'Checked your bank accounts',
}

export function useAgent() {
  const { api } = useAuth()
  const { createWallet, loadBalance, loadActivity } = useWallet()
  const { startVerification, openAccount, load: loadBank } = useBank()

  const messages = useState<AgentMessage[]>('fm-agent-messages', () => [])
  const decisions = useState<Record<string, Decision>>('fm-agent-decisions', () => ({}))
  const pendingId = useState<string>('fm-agent-pending', () => '')
  const busy = useState<boolean>('fm-agent-busy', () => false)
  const error = useState<string>('fm-agent-error', () => '')

  const turns = computed<Turn[]>(() => {
    const out: Turn[] = []
    messages.value.forEach((message, mi) => {
      message.content.forEach((block, bi) => {
        const key = `${mi}-${bi}`
        if (block.type === 'text' && block.text) {
          out.push({ key, kind: message.role === 'user' ? 'user' : 'ai', text: block.text })
        } else if (block.type === 'tool_use' && block.name && block.id) {
          if (ACTION_NAMES.includes(block.name)) {
            if (decisions.value[block.id]) {
              out.push({ key, kind: 'action', id: block.id, name: block.name, input: block.input || {} })
            }
          } else {
            out.push({ key, kind: 'look', text: LOOK_LABELS[block.name] || 'Looked something up' })
          }
        }
      })
    })
    return out
  })

  const pending = computed(() => {
    const id = pendingId.value
    if (!id) {
      return null
    }
    for (const message of messages.value) {
      for (const block of message.content) {
        if (block.type === 'tool_use' && block.id === id) {
          return block
        }
      }
    }
    return null
  })

  // The server accepts 40 messages. Past that, a fresh chat is needed.
  const full = computed(() => messages.value.length >= 36)

  async function run(): Promise<void> {
    busy.value = true
    error.value = ''
    try {
      const result = await api<{
        messages: AgentMessage[]
        proposal: { id: string; name: string; input: Record<string, string> } | null
      }>('/api/agent/chat', { method: 'POST', body: { messages: messages.value } as any })
      messages.value = [...messages.value, ...result.messages]
      if (result.proposal) {
        decisions.value = {
          ...decisions.value,
          [result.proposal.id]: { status: 'pending', note: '' },
        }
        pendingId.value = result.proposal.id
      }
    } catch (err: any) {
      error.value = errorText(err)
    } finally {
      busy.value = false
    }
  }

  function setDecision(id: string, status: DecisionStatus, note = '') {
    decisions.value = { ...decisions.value, [id]: { status, note } }
  }

  function resultMessage(id: string, content: string, isError = false): AgentBlock {
    return { type: 'tool_result', tool_use_id: id, content, ...(isError ? { is_error: true } : {}) }
  }

  /** Sends what the user typed. */
  async function send(text: string): Promise<void> {
    const clean = text.trim()
    if (!clean || busy.value || full.value) {
      return
    }
    // An open approval card counts as "not now". It is closed with its own
    // short exchange first, so the model always gets an answer for its request.
    if (pendingId.value) {
      await decline()
      if (error.value) {
        return
      }
    }
    messages.value = [
      ...messages.value,
      { role: 'user', content: [{ type: 'text', text: clean.slice(0, 2000) }] },
    ]
    await run()
  }

  async function retry(): Promise<void> {
    if (!busy.value) {
      await run()
    }
  }

  async function decline(): Promise<void> {
    const id = pendingId.value
    if (!id || busy.value) {
      return
    }
    pendingId.value = ''
    setDecision(id, 'declined', 'Declined')
    messages.value = [
      ...messages.value,
      { role: 'user', content: [resultMessage(id, 'The user declined. Nothing was done.')] },
    ]
    await run()
  }

  async function execute(name: string, input: Record<string, string>): Promise<string> {
    switch (name) {
      case 'create_wallet':
        await createWallet()
        return 'The wallet was created.'
      case 'send_usdc': {
        const sent = await api<{ id: string; state: string }>('/api/transfer', {
          method: 'POST',
          body: { to: input.to, amount: input.amount, requestId: crypto.randomUUID() },
        })
        loadBalance().catch(() => undefined)
        loadActivity().catch(() => undefined)
        return `The transfer was started (state ${sent.state || 'pending'}). It can take a minute to complete.`
      }
      case 'start_identity_verification':
        await startVerification(input.full_name, input.type as 'individual' | 'business')
        loadBank().catch(() => undefined)
        return 'The identity check was started. The user finishes it on the Identity check page in the app.'
      case 'open_bank_account':
        await openAccount(input.currency as 'usd' | 'eur' | 'gbp')
        loadBank().catch(() => undefined)
        return 'The bank account was opened.'
      default:
        throw new Error('This action is not supported.')
    }
  }

  /** The user's go-ahead. Runs the proposed action, then lets the assistant report back. */
  async function approve(): Promise<void> {
    const call = pending.value
    if (!call || !call.id || !call.name || busy.value) {
      return
    }
    const id = call.id
    busy.value = true
    setDecision(id, 'running')
    let content = ''
    let failed = false
    try {
      content = await execute(call.name, call.input || {})
      setDecision(id, 'done', content)
    } catch (err: any) {
      failed = true
      content = `It failed: ${errorText(err)}`
      setDecision(id, 'failed', errorText(err))
    }
    pendingId.value = ''
    messages.value = [
      ...messages.value,
      { role: 'user', content: [resultMessage(id, content, failed)] },
    ]
    busy.value = false
    await run()
  }

  function reset() {
    messages.value = []
    decisions.value = {}
    pendingId.value = ''
    error.value = ''
    busy.value = false
  }

  return { messages, turns, decisions, pending, busy, error, full, send, retry, approve, decline, reset }
}
