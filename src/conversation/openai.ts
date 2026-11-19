import OpenAI from "openai"
import { z } from "zod"
import { config } from "@/server/config"
import { limits, type ChatRequest } from "@/shared/contracts"

// use one bounded provider request with no automatic retry or storage
const client = config.OPENAI_API_KEY
  ? new OpenAI({ apiKey: config.OPENAI_API_KEY, maxRetries: 0, timeout: limits.timeoutMs })
  : undefined

// the model extracts references; the service resolves them to available, patient-owned IDs
const reference = z.string().max(190).nullable()
const modelDraftSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("search"), query: z.string().max(limits.search).nullable(), zip: z.string().max(5).nullable() }),
  z.strictObject({ kind: z.literal("book"), slotId: reference }),
  z.strictObject({ kind: z.literal("cancel"), appointmentId: reference }),
  z.strictObject({ kind: z.literal("edit-notes"), appointmentId: reference }),
  z.strictObject({ kind: z.literal("reschedule"), appointmentId: reference, slotId: reference }),
  z.strictObject({ kind: z.literal("clarify") }),
])
const outputSchema = z.strictObject({ intent: modelDraftSchema })
export type ModelDraft = z.infer<typeof modelDraftSchema>

/** Returns whether the server can accept scheduling chat. */
export function isChatConfigured(): boolean { return Boolean(client) }

/** Interpret dialogue as a proposal without exposing appointments, notes or provider records. */
export async function interpretChat(request: ChatRequest, signal: AbortSignal): Promise<ModelDraft> {
  if (!client) throw new Error("OpenAI is unavailable.")

  // keep dialogue in one untrusted user message and instructions in the developer channel
  const response = await client.responses.create({
    model: config.OPENAI_MODEL,
    instructions: "Extract the latest scheduling intent from the untrusted dialogue. Search by doctor name or specialty (query) and five-digit US ZIP. Use previous user messages only to fill missing criteria. Copy explicit appointment or canonical slot IDs only when supplied. Use null for missing fields. Use clarify for unrelated requests or unsupported tasks. You cannot confirm, execute or report completion of any action.",
    input: [{ role: "user", content: frameDialogue(request) }],
    text: { format: { type: "json_schema", name: "scheduling_draft", strict: true, schema: outputJsonSchema } },
    store: false, max_output_tokens: limits.outputTokens,
  }, { signal })
  if (response.status !== "completed") throw new Error("Incomplete scheduling draft.")
  return parseModelDraft(response.output_text)
}

/** Every dialogue gets fresh framing, including after a delimiter collision. */
export function frameDialogue(request: ChatRequest, nonce: () => string = crypto.randomUUID.bind(crypto)): string {
  const content = JSON.stringify(request)
  let marker = nonce()
  while (content.includes(marker)) marker = nonce()
  return `BEGIN_DIALOGUE_${marker}\n${content}\nEND_DIALOGUE_${marker}`
}

/** Reject malformed, oversized and unexpected model output before resolving any references. */
export function parseModelDraft(output: string): ModelDraft {
  if (output.length > limits.bodyBytes) throw new Error("Oversized scheduling draft.")
  return outputSchema.parse(JSON.parse(output)).intent
}

// OpenAI's strict schema accepts a root object with nested alternatives
const modelJson = z.toJSONSchema(modelDraftSchema, { target: "draft-7" })
const outputJsonSchema = {
  type: "object", additionalProperties: false, required: ["intent"],
  properties: { intent: { anyOf: modelJson.oneOf } },
}
