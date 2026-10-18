import type { AgentBlock, AgentMessage } from './agentRules'

/**
 * Talks to Google Gemini (generateContent). Pure conversion helpers live here
 * too, so they can be tested without the network.
 */

type Part = Record<string, any>
interface GeminiContent {
  role: 'user' | 'model'
  parts: Part[]
}

/** Our conversation, in the shape Gemini expects. */
export function toGeminiContents(messages: AgentMessage[]): GeminiContent[] {
  // For each tool call, what Gemini called it, so the answer can say so too.
  const calls = new Map<string, { name: string; id?: string }>()
  const contents: GeminiContent[] = []

  for (const message of messages) {
    if (message.role === 'assistant') {
      if (message.raw) {
        const call = message.raw.parts.find((p) => p.functionCall)
        const block = message.content.find((b) => b.type === 'tool_use')
        if (call && block && block.id) {
          calls.set(block.id, { name: call.functionCall.name, id: call.functionCall.id })
        }
        contents.push({ role: 'model', parts: message.raw.parts })
        continue
      }
      const parts: Part[] = []
      for (const block of message.content) {
        if (block.type === 'text' && block.text) {
          parts.push({ text: block.text })
        } else if (block.type === 'tool_use' && block.id && block.name) {
          calls.set(block.id, { name: block.name })
          parts.push({ functionCall: { name: block.name, args: block.input || {} } })
        }
      }
      contents.push({ role: 'model', parts })
      continue
    }

    const parts: Part[] = []
    for (const block of message.content) {
      if (block.type === 'tool_result' && block.tool_use_id) {
        const call = calls.get(block.tool_use_id)
        parts.push({
          functionResponse: {
            ...(call?.id ? { id: call.id } : {}),
            name: call?.name || 'unknown',
            response: block.is_error ? { error: block.content } : { output: block.content },
          },
        })
      } else if (block.type === 'text' && block.text) {
        parts.push({ text: block.text })
      }
    }
    contents.push({ role: 'user', parts })
  }
  return contents
}

export interface GeminiTurn {
  blocks: AgentBlock[]
  raw: { role: 'model'; parts: Part[] } | null
}

/**
 * Reads Gemini's reply. Only the first tool call is kept (any extra ones are
 * dropped before the turn is stored), so each approval stands on its own.
 */
export function parseGeminiReply(reply: any, newId: () => string): GeminiTurn {
  const parts: Part[] = reply?.candidates?.[0]?.content?.parts || []
  const kept: Part[] = []
  const blocks: AgentBlock[] = []
  let called = false

  for (const part of parts) {
    if (called || !part || typeof part !== 'object') {
      continue
    }
    if (part.functionCall && typeof part.functionCall.name === 'string') {
      called = true
      kept.push(part)
      const args = part.functionCall.args && typeof part.functionCall.args === 'object' ? part.functionCall.args : {}
      blocks.push({
        type: 'tool_use',
        id: String(part.functionCall.id || newId()).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80),
        name: part.functionCall.name,
        input: args,
      })
    } else {
      kept.push(part)
      if (typeof part.text === 'string' && part.text.trim() && !part.thought) {
        blocks.push({ type: 'text', text: part.text })
      }
    }
  }

  return { blocks, raw: kept.length > 0 ? { role: 'model', parts: kept } : null }
}

export async function callGemini(options: {
  apiKey: string
  model: string
  system: string
  messages: AgentMessage[]
  tools: unknown
}): Promise<any> {
  const model = options.model.replace(/^models\//, '')
  try {
    return await $fetch<any>(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'x-goog-api-key': options.apiKey, 'content-type': 'application/json' },
        body: {
          systemInstruction: { parts: [{ text: options.system }] },
          contents: toGeminiContents(options.messages),
          tools: options.tools,
          toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
          generationConfig: { maxOutputTokens: 1200, temperature: 0.4 },
        },
        timeout: 45_000,
      },
    )
  } catch (err: any) {
    console.error('Gemini request failed', err?.statusCode, err?.data?.error?.message || err?.message)
    const status = Number(err?.statusCode) || 0
    throw createError({
      statusCode: 502,
      statusMessage:
        status === 401 || status === 403
          ? 'The assistant key was not accepted. Check GEMINI_API_KEY'
          : status === 404
            ? 'The assistant model was not found. Check GEMINI_MODEL'
            : status === 429 || status === 503
              ? 'The assistant is busy right now. Please try again in a moment'
              : status === 400
                ? 'The assistant could not read the conversation. Start a new chat'
                : 'The assistant could not answer right now',
    })
  }
}
