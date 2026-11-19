import { isChatConfigured } from "@/conversation/openai"
import { limits } from "@/shared/contracts"
import { apiError, createSchedulingRoutes } from "./http"

// serve the browser and the scheduling API from one loopback origin
export function startApp({ port, directory, model }: {
  port: number
  directory: Parameters<typeof createSchedulingRoutes>[0]
  model?: Parameters<typeof createSchedulingRoutes>[1]
}) {
  return Bun.serve({
    hostname: "127.0.0.1",
    port,
    maxRequestBodySize: limits.bodyBytes,
    routes: {
      "/": { GET: () => new Response(Bun.file("src/web/index.html")) },
      "/assets/app.js": { GET: () => new Response(Bun.file("dist/app.js")) },
      "/assets/app.css": { GET: () => new Response(Bun.file("dist/app.css")) },
      "/api/health": { GET: () => Response.json({ status: "ok", zocdocMode: "mock" }) },
      "/api/status": { GET: () => Response.json({ chatConfigured: model?.configured() ?? isChatConfigured() }) },
      "/api/evals": { GET: async () => {
        const file = Bun.file(".evals/latest.json")
        return await file.exists() ? new Response(file, { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } })
          : apiError(404, "not_found", "Run bun run evals to generate a report.")
      } },
      ...createSchedulingRoutes(directory, model),
    },
    fetch: () => apiError(404, "not_found", "Route not found."),
    error: () => apiError(500, "provider_unavailable", "The request could not be completed."),
  })
}
