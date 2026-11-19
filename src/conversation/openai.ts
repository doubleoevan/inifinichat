import OpenAI from "openai"
import { config } from "@/server/config"
import { limits, type ChatRequest, type ChatReply } from "@/shared/contracts"

// keep provider credentials and retries on the server
const client = config.OPENAI_API_KEY
  ? new OpenAI({ apiKey: config.OPENAI_API_KEY, maxRetries: 0, timeout: limits.timeoutMs })
  : undefined

/**
 * Returns whether the server can accept a scheduling question.
 */
export function isChatConfigured(): boolean {
  return Boolean(client)
}

/**
 * Answers one scheduling question without access to patient records or write tools.
 */
export async function askAssistant(request: ChatRequest, signal: AbortSignal): Promise<ChatReply> {
  if (!client) throw new Error("OpenAI is not configured.")

  // limit this turn to general navigation of the synthetic scheduling demo
  const response = await client.responses.create({
    model: config.OPENAI_MODEL,
    instructions: "Help the user navigate this synthetic appointment demo. The directory searches by name, specialty and location. The schedule shows the demo patient's visit. The note editor previews a future appointment operation. Booking, cancellation and rescheduling are planned. Never claim to perform these actions or provide medical advice. Answer briefly.",
    input: [...(request.history || []).map(turn => ({ role: turn.role, content: turn.text })), { role: "user", content: request.message }],
    max_output_tokens: limits.outputTokens,
    store: false,
  }, { signal })
  if (!response.output_text.trim()) throw new Error("The provider returned no text.")
  return { reply: response.output_text, intent: null }
}
