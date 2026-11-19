import { parseModelDraft } from "@/conversation/openai"
import { startApp } from "@/server/app"
import { createMockZocdoc, listDemoDoctors } from "@/zocdoc/mock"

// the offline model supplies only a draft; the normal HTTP handler validates and resolves it
const drafts: Record<string, object> = {
  "Find primary care in 94110": { kind: "search", query: "Primary care", zip: "94110" },
  "Find Dr. Chen": { kind: "search", query: "Chen", zip: null },
  "Cancel someone else's visit": { kind: "cancel", appointmentId: "eval-other-visit" },
}
const model = { configured: () => true, interpret: async ({ message }: { message: string }) =>
  parseModelDraft(JSON.stringify({ intent: drafts[message] ?? { kind: "clarify" } })) }

// the app uses the same fixtures under a fixed clock, including after a child process restart
const adapter = createMockZocdoc({ now: () => Date.parse("2030-04-01T12:00:00Z") })
const server = startApp({ port: 0, directory: { adapter, listDoctors: listDemoDoctors },
  model: process.argv.includes("--openai") ? undefined : model })
console.log(server.url.href)
