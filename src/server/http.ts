import type { z } from "zod"
import { interpretChat, isChatConfigured } from "@/conversation/openai"
import {
  bookingSchema, cancellationSchema, chatRequestSchema, doctorSchema, idSchema, limits, profileUpdateSchema,
  searchSchema, slotSchema, visitUpdateSchema, type ApiError, type Doctor, type SchedulingAdapter,
} from "@/shared/contracts"
import {
  availableSlots, changeAppointment, providerCall, readAppointments, readPatient, readSchedule,
  requireDatabase, resolveSlot, SchedulingError, updatePatient,
} from "@/storage/schedule"
import { resolveDraft } from "./chat"

type Directory = { adapter: SchedulingAdapter; listDoctors: () => Doctor[] }

/** Compose the frozen Step 1 endpoints with an injected local provider. */
export function createSchedulingRoutes(directory: Directory) {
  return {
    "/api/schedule": { GET: () => serve(readSchedule) },
    "/api/patient": {
      GET: () => serve(() => readPatient()),
      PATCH: (request: Request) => write(request, profileUpdateSchema, data => updatePatient(data.name)),
    },
    "/api/doctors": { GET: (request: Request) => serve(async () => {
      // an empty query opens the directory; submitted criteria require both fields
      const params = new URL(request.url).searchParams
      if (!params.size) return directory.listDoctors()
      const criteria = searchSchema.safeParse({ query: params.get("q"), zip: params.get("zip") })
      if (!criteria.success) throw new SchedulingError("invalid_request", "Enter a doctor name or specialty and a five-digit US ZIP.")
      return providerCall(async () => doctorSchema.array().max(limits.candidates).parse(await directory.adapter.searchProviders(criteria.data)))
    }) },
    "/api/doctors/:id/availability": { GET: (request: Request) => serve(async () => {
      const doctorId = routeId(request)
      const locationId = new URL(request.url).searchParams.get("locationId")
      if (!locationId || !idSchema.safeParse(locationId).success) throw new SchedulingError("invalid_request", "A location ID is required.")
      const slots = await providerCall(async () => slotSchema.array().parse(await directory.adapter.getAvailability({ doctorId, locationId })))
      return availableSlots(slots)
    }) },
    "/api/appointments": {
      GET: () => serve(() => readAppointments()),
      POST: (request: Request) => write(request, bookingSchema, data =>
        changeAppointment(requireDatabase(), directory, { kind: "book", data })),
    },
    "/api/appointments/:id": { PATCH: (request: Request) => write(request, visitUpdateSchema, data =>
      changeAppointment(requireDatabase(), directory, { kind: "update", id: routeId(request), data })) },
    "/api/appointments/:id/cancel": { POST: (request: Request) => write(request, cancellationSchema, data =>
      changeAppointment(requireDatabase(), directory, { kind: "cancel", id: routeId(request), data })) },
    "/api/chat": { POST: (request: Request) => write(request, chatRequestSchema, async data => {
      // interpreting chat never invokes a mutating service
      if (!isChatConfigured()) throw new SchedulingError("provider_unavailable", "Chat is unavailable. Use the scheduling forms.")
      const draft = await interpretChat(data, request.signal).catch(() => {
        throw new SchedulingError("provider_unavailable", "Chat could not interpret this request. Use the scheduling forms.")
      })
      return resolveDraft(draft, {
        appointments: readAppointments,
        available: async slotId => {
          // unknown model-generated IDs cannot turn into a selection
          try {
            const { slot } = await resolveSlot(directory, slotId)
            return (await availableSlots([slot])).length > 0
          } catch (error) {
            if (error instanceof SchedulingError && error.code === "not_found") return false
            throw error
          }
        },
      })
    }) },
  }
}

function routeId(request: Request): string {
  const id = new URL(request.url).pathname.split("/")[3]
  if (!idSchema.safeParse(id).success) throw new SchedulingError("invalid_request", "Invalid resource ID.")
  return id
}

async function write<T>(request: Request, schema: z.ZodType<T>, apply: (input: T) => Promise<unknown>): Promise<Response> {
  const command = await readCommand(request, schema)
  if ("error" in command) return command.error
  return serve(() => apply(command.input))
}

async function serve(call: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await call(), { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    // expose known failures without database messages, URLs, request bodies or secrets
    if (error instanceof SchedulingError) {
      const codes: Partial<Record<ApiError["code"], number>> = {
        invalid_request: 400, not_found: 404, conflict: 409, provider_unavailable: 503,
      }
      return apiError(codes[error.code] ?? 503, error.code, error.message)
    }
    return apiError(503, "database_unavailable", "The schedule database is unavailable. Refresh before retrying.")
  }
}

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
