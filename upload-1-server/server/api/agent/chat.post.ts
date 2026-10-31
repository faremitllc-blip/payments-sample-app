import { rateLimit, requireUser } from '../../utils/auth'
import { checkProposal, runReadTool } from '../../utils/agentTools'
import {
  cleanMessages,
  isActionTool,
  isReadTool,
  geminiTools,
  systemPrompt,
  type AgentBlock,
  type AgentMessage,
} from '../../utils/agentRules'
import { cleanCredential } from '../../utils/clean'
import { callGemini, parseGeminiReply } from '../../utils/gemini'

const MAX_STEPS = 6

// Runs one turn of the assistant. It may look things up on its own, but it can
// never change anything: actions come back as proposals that the browser shows
// to the user and only runs, through the normal API, after they approve.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  rateLimit(user.id, 'agent', 20, 60_000)

  const config = useRuntimeConfig()
  const apiKey = cleanCredential(config.geminiApiKey)
  if (!apiKey) {
    throw createError({
      statusCode: 503,
      statusMessage: 'The assistant is not set up on the server yet',
    })
  }
  const model = String(config.geminiModel || '').trim() || 'gemini-3.8-flash'

  const body = (await readBody<{ messages?: unknown }>(event)) || {}
  const history = cleanMessages(body.messages)
  if (!history) {
    throw createError({ statusCode: 400, statusMessage: 'That message could not be read' })
  }

  const circleKey = cleanCredential(config.circleApiKey)
  const system = systemPrompt({
    live: circleKey.length > 0 && !circleKey.startsWith('TEST_API_KEY:'),
    network: String(config.circleBlockchain || 'MATIC-AMOY'),
    today: new Date().toISOString().slice(0, 10),
  })

  const tools = geminiTools()
  const added: AgentMessage[] = []
  const all = () => [...history, ...added]

  for (let step = 0; step < MAX_STEPS; step++) {
    const reply = await callGemini({
      apiKey,
      model,
      system,
      messages: all(),
      tools,
    })
    const turn = parseGeminiReply(reply, () => `call_${Math.random().toString(36).slice(2, 10)}`)
    const blocks: AgentBlock[] = turn.blocks
    if (blocks.length === 0) {
      blocks.push({
        type: 'text',
        text: reply?.promptFeedback?.blockReason
          ? 'I cannot help with that one. Is there something else?'
          : 'Sorry, I have nothing to add to that.',
      })
    }
    added.push({ role: 'assistant', content: blocks, ...(turn.raw ? { raw: turn.raw } : {}) })

    const call = blocks.find((b) => b.type === 'tool_use')
    if (!call || !call.id || !call.name) {
      return { messages: added, proposal: null }
    }

    // Look-ups run here and the loop carries on.
    if (isReadTool(call.name)) {
      let content: string
      let isError = false
      try {
        content = JSON.stringify(await runReadTool(call.name, call.input || {}, user.id))
      } catch (err: any) {
        content = String(err?.statusMessage || 'That lookup failed')
        isError = true
      }
      added.push({
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: call.id, content, ...(isError ? { is_error: true } : {}) },
        ],
      })
      continue
    }

    // Actions are only checked, then handed to the user to approve or decline.
    if (isActionTool(call.name)) {
      const check = await checkProposal(call.name, call.input || {}, user.id)
      if (check.ok) {
        return {
          messages: added,
          proposal: { id: call.id, name: call.name, input: check.input },
        }
      }
      added.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: call.id, content: check.error, is_error: true }],
      })
      continue
    }

    added.push({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: call.id, content: 'Unknown tool.', is_error: true }],
    })
  }

  // Too many look-ups in a row: stop politely instead of looping.
  added.push({
    role: 'assistant',
    content: [{ type: 'text', text: 'I could not finish that. Could you rephrase or break it into smaller steps?' }],
  })
  return { messages: added, proposal: null }
})
