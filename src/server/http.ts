import type { z } from "zod"
import { limits, type ApiError } from "@/shared/contracts"

/**
 * Returns a stable public error without exposing provider internals.
 */
export function apiError(status: number, code: ApiError["code"], error: string): Response {
  return Response.json({ code, error } satisfies ApiError, { status })
}

/**
 * Validates an untrusted JSON write against its public contract.
 */
export async function readCommand<T>(request: Request, schema: z.ZodType<T>): Promise<{ input: T } | { error: Response }> {
  const origin = request.headers.get("Origin")
  if (origin && origin !== new URL(request.url).origin) return { error: apiError(403, "forbidden", "Cross-origin writes are disabled.") }
  if (request.headers.get("Content-Type")?.split(";")[0] !== "application/json") {
    return { error: apiError(415, "unsupported_media_type", "Send application/json.") }
  }

  // enforce the cap on bytes actually received as well as Bun's request-size limit
  const bytes = await request.arrayBuffer()
  if (bytes.byteLength > limits.bodyBytes) return { error: apiError(413, "payload_too_large", "Request body is too large.") }
  try {
    const parsed = schema.safeParse(JSON.parse(new TextDecoder().decode(bytes)))
    if (parsed.success) return { input: parsed.data }
  } catch { /* invalid JSON uses the same public validation error */ }
  return { error: apiError(400, "invalid_request", "Request does not match the scheduling contract.") }
}

/**
 * Validates a future write and reports its implementation status.
 */
export async function pendingWrite<T>(request: Request, schema: z.ZodType<T>): Promise<Response> {
  const command = await readCommand(request, schema)
  if ("error" in command) return command.error
  return apiError(501, "not_implemented", "This scheduling operation is not implemented yet.")
}
