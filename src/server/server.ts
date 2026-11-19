import { askAssistant, isChatConfigured } from "@/conversation/openai"
import { readSchedule } from "@/storage/schedule"
import { mockZocdoc } from "@/zocdoc/mock"

// serve a fixed asset list and the API from the same loopback origin
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.PORT || 3000),
  maxRequestBodySize: 8_192,
  routes: {
    "/": { GET: () => new Response(Bun.file("src/web/index.html")) },
    "/assets/app.js": { GET: () => new Response(Bun.file("dist/app.js")) },
    "/assets/app.css": { GET: () => new Response(Bun.file("dist/app.css")) },
    "/api/schedule": { GET: async () => Response.json(await readSchedule(), { headers: { "Cache-Control": "no-store" } }) },
    "/api/doctors": { GET: async request => {
      const parameters = new URL(request.url).searchParams
      return Response.json(await mockZocdoc.search({ query: parameters.get("q") ?? "", location: parameters.get("location") ?? "" }))
    } },
    "/api/doctors/:id/availability": { GET: async request => Response.json(await mockZocdoc.availability(request.params.id)) },
    "/api/chat": { POST: handleChat },
    "/api/status": { GET: () => Response.json({ chatConfigured: isChatConfigured() }) },
  },
  fetch: () => Response.json({ error: "Not found." }, { status: 404 }),
  error: () => Response.json({ error: "Service unavailable. Check local configuration and database setup." }, { status: 503 }),
})
console.log(`Inifinichat listening on ${server.url}`)

async function handleChat(request: Request): Promise<Response> {
  // accept JSON from this origin or a local command-line client
  const origin = request.headers.get("Origin")
  if (origin && origin !== new URL(request.url).origin) return new Response(null, { status: 403 })
  if (request.headers.get("Content-Type")?.split(";")[0] !== "application/json") return new Response(null, { status: 415 })

  // bound the message before making a single provider request
  const body: unknown = await request.json().catch(() => null)
  const message = body && typeof body === "object" && "message" in body ? body.message : null
  if (typeof message !== "string" || !message.trim() || message.length > 1500) {
    return Response.json({ error: "Enter a message of 1 to 1,500 characters." }, { status: 400 })
  }
  if (!isChatConfigured()) return Response.json({ error: "Set OPENAI_API_KEY in .env to enable chat." }, { status: 503 })

  // keep provider errors and credentials out of the response
  try {
    return Response.json(await askAssistant(message.trim(), request.signal))
  } catch {
    return Response.json({ error: "The assistant could not respond. Please try again." }, { status: 502 })
  }
}
