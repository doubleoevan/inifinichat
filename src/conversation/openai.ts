import OpenAI from "openai"
import type { ChatReply } from "@/shared/contracts"

// keep provider credentials and retries on the server
const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 20_000 })
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
export async function askAssistant(message: string, signal: AbortSignal): Promise<ChatReply> {
  if (!client) throw new Error("OpenAI is not configured.")

  // limit this turn to general navigation of the synthetic scheduling demo
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    instructions: "Help the user navigate this synthetic appointment demo. The directory searches by name, specialty and location. The schedule shows the demo patient's visit. Notes are local to the browser. Booking, cancellation and rescheduling are planned. Never claim to perform these actions or provide medical advice. Answer briefly.",
    input: message,
    max_output_tokens: 250,
    store: false,
  }, { signal })
  if (!response.output_text.trim()) throw new Error("The provider returned no text.")
  return { reply: response.output_text }
}
