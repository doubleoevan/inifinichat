import { askAssistant, isChatConfigured } from "@/conversation/openai"
import { bookingSchema, cancellationSchema, chatRequestSchema, idSchema, limits, profileUpdateSchema, searchSchema, visitUpdateSchema } from "@/shared/contracts"
import { readSchedule } from "@/storage/schedule"
import { listDemoDoctors, mockZocdoc } from "@/zocdoc/mock"
import { config } from "./config"
import { apiError, pendingWrite, readCommand } from "./http"

// serve browser assets and the scheduling API on the same local origin
const server = Bun.serve({
  hostname: "127.0.0.1", port: config.PORT, maxRequestBodySize: limits.bodyBytes,
  routes: {
    "/": { GET: () => new Response(Bun.file("src/web/index.html")) },
    "/assets/app.js": { GET: () => new Response(Bun.file("dist/app.js")) },
    "/assets/app.css": { GET: () => new Response(Bun.file("dist/app.css")) },
    "/api/health": { GET: () => Response.json({ status: "ok", zocdocMode: config.ZOCDOC_MODE }) },
    "/api/status": { GET: () => Response.json({ chatConfigured: isChatConfigured() }) },
    "/api/schedule": { GET: async () => Response.json(await readSchedule(), { headers: { "Cache-Control": "no-store" } }) },
    "/api/patient": {
      GET: async () => Response.json((await readSchedule()).patient),
      PATCH: request => pendingWrite(request, profileUpdateSchema),
    },
    "/api/appointments": {
      GET: async () => Response.json((await readSchedule()).appointments),
      POST: request => pendingWrite(request, bookingSchema),
    },
    "/api/appointments/:id": { PATCH: request => idSchema.safeParse(request.params.id).success
      ? pendingWrite(request, visitUpdateSchema) : apiError(400, "invalid_request", "Invalid appointment ID.") },
    "/api/appointments/:id/cancel": { POST: request => idSchema.safeParse(request.params.id).success
      ? pendingWrite(request, cancellationSchema) : apiError(400, "invalid_request", "Invalid appointment ID.") },
    "/api/doctors": { GET: searchDirectory },
    "/api/doctors/:id/availability": { GET: async request => {
      const locationId = new URL(request.url).searchParams.get("locationId")
      if (!idSchema.safeParse(request.params.id).success || !locationId || !idSchema.safeParse(locationId).success) {
        return apiError(400, "invalid_request", "A provider and location ID are required.")
      }
      return Response.json(await mockZocdoc.getAvailability({ doctorId: request.params.id, locationId }))
    } },
    "/api/chat": { POST: handleChat },
  },
  fetch: () => apiError(404, "not_found", "Route not found."),
  error: () => apiError(503, "database_unavailable", "Service unavailable. Check local database setup."),
})
console.log(`Inifinichat listening on ${server.url}`)

async function searchDirectory(request: Request): Promise<Response> {
  // show the fixture directory until the user submits both search fields
  const parameters = new URL(request.url).searchParams
  if (!parameters.size) return Response.json(listDemoDoctors())
  const criteria = searchSchema.safeParse({ query: parameters.get("q"), zip: parameters.get("zip") })
  if (!criteria.success) return apiError(400, "invalid_request", "Enter a doctor name or specialty and a five-digit US ZIP.")
  return Response.json(await mockZocdoc.searchProviders(criteria.data))
}

async function handleChat(request: Request): Promise<Response> {
  const command = await readCommand(request, chatRequestSchema)
  if ("error" in command) return command.error
  if (!isChatConfigured()) return apiError(503, "provider_unavailable", "Set OPENAI_API_KEY in .env to enable chat.")

  // keep provider errors out of the public response
  try {
    return Response.json(await askAssistant(command.input, request.signal))
  } catch {
    return apiError(502, "provider_unavailable", "The assistant could not respond. Please try again.")
  }
}
