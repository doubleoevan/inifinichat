import { isChatConfigured } from "@/conversation/openai"
import { limits } from "@/shared/contracts"
import { listDemoDoctors, mockZocdoc } from "@/zocdoc/mock"
import { config } from "./config"
import { apiError, createSchedulingRoutes } from "./http"

// serve the browser and the scheduling API from one loopback origin
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: config.PORT,
  maxRequestBodySize: limits.bodyBytes,
  routes: {
    "/": { GET: () => new Response(Bun.file("src/web/index.html")) },
    "/assets/app.js": { GET: () => new Response(Bun.file("dist/app.js")) },
    "/assets/app.css": { GET: () => new Response(Bun.file("dist/app.css")) },
    "/api/health": { GET: () => Response.json({ status: "ok", zocdocMode: config.ZOCDOC_MODE }) },
    "/api/status": { GET: () => Response.json({ chatConfigured: isChatConfigured() }) },
    ...createSchedulingRoutes({ adapter: mockZocdoc, listDoctors: listDemoDoctors }),
  },
  fetch: () => apiError(404, "not_found", "Route not found."),
  error: () => apiError(500, "provider_unavailable", "The request could not be completed."),
})
console.log(`Inifinichat listening on ${server.url}`)
