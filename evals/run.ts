import assert from "node:assert/strict"
import { mkdir, rename } from "node:fs/promises"
import { chatReplySchema, doctorSchema, evalReportSchema, type EvalResult } from "@/shared/contracts"
import { execute, schedulingCases, type Session } from "./cases"
import { seedOtherOwner, startPostgres, startProbe } from "./local"

const flags = new Set(process.argv.slice(2))
if ([...flags].some(flag => !["--neon", "--openai"].includes(flag))) {
  throw new Error("Supported eval flags: --neon and --openai.")
}
const cases: EvalResult[] = []
let database: Awaited<ReturnType<typeof startPostgres>> | undefined
let app: Awaited<ReturnType<typeof startProbe>> | undefined
let unavailable: string | undefined

// offline scenarios run in a fresh app process with no live credentials
try {
  try {
    database = await startPostgres()
    await seedOtherOwner(database.url)
    app = await startProbe(database.url)
  } catch (error) { unavailable = error instanceof Error ? error.message : "Temporary PostgreSQL unavailable." }
  const session: Session = {
    get origin() { return app!.origin },
    async restart() { await app!.stop(); app = await startProbe(database!.url) },
    async checkOutage() {
      const down = await startProbe("postgres://127.0.0.1:1/unavailable")
      try {
        const response = await fetch(down.origin + "/api/appointments", { signal: AbortSignal.timeout(8000) })
        assert.equal((await response.json()).code, "database_unavailable")
        return response.status
      } finally { await down.stop() }
    },
  }
  for (const scenario of schedulingCases(session)) {
    const result = await execute(scenario, "Fixture model · mock Zocdoc · temporary local PostgreSQL", unavailable)
    cases.push(result);console.log(result.status, result.title, result.error ?? "")
  }
} finally {
  try { await app?.stop() } finally { await database?.stop() }
}

// reuse the application’s existing Neon probe, with its isolated synthetic rows and cleanup
cases.push(await execute({ id: "live-neon", title: "Live Neon persistence", input: "Run the Neon restart and ownership probes.",
  expected: "Both probes pass, including slot conflicts, a fresh Bun process, cancellation, and test-record cleanup.",
  async run(e) {
    const output = await e.measure("Neon HTTP and persistence probes", async () => {
      const child = Bun.spawn([process.execPath, "test", "tests/scheduling-neon.test.ts"], {
        env: { ...process.env, RUN_NEON_TESTS: "1", OPENAI_API_KEY: "" }, stdout: "pipe", stderr: "pipe",
      })
      const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
      if (exit) {
        throw new Error("Live Neon probes failed. Run the documented Neon test command for diagnostics.")
      }
      return stdout + stderr
    })
    assert(output.includes("Neon PASS:") && /2 pass\b/.test(output) && /0 fail\b/.test(output))
    e.observe(output.split("\n").find(line => line.startsWith("Neon PASS:"))!)
    e.observe("2 probes passed; all run-owned patient, appointment and operation rows cleaned up.")
  },
}, "No model · mock Zocdoc · real Neon", !flags.has("--neon") ? "Opt in with --neon." : !process.env.DATABASE_URL ? "DATABASE_URL is missing." : undefined))

// spend at most one live model call per explicitly selected run
cases.push(await execute({ id: "live-openai", title: "Live OpenAI interpretation", input: "Find a cardiologist in ZIP 94115.",
  expected: "Return a validated search draft that finds the mock cardiology provider in 94115 without changing an appointment.",
  async run(e) {
    const probe = await startProbe("", true)
    try {
      const reply = await e.measure("Chat HTTP round trip", async () => {
        const response = await fetch(probe.origin + "/api/chat", { method: "POST", headers: { "Content-Type": "application/json", Origin: probe.origin },
          body: JSON.stringify({ message: "Find a cardiologist in ZIP 94115." }), signal: AbortSignal.timeout(25_000) })
        assert.equal(response.status, 200)
        return chatReplySchema.parse(await response.json())
      })
      e.observe(JSON.stringify(reply.intent))
      assert(reply.intent?.kind === "search" && reply.intent.criteria.zip === "94115")
      const params = new URLSearchParams({ q: reply.intent.criteria.query, zip: reply.intent.criteria.zip })
      const doctors = await e.measure("Mock directory HTTP round trip", async () => {
        const response = await fetch(probe.origin + "/api/doctors?" + params, { signal: AbortSignal.timeout(8000) })
        assert.equal(response.status, 200)
        return doctorSchema.array().parse(await response.json())
      })
      e.observe(`Matching providers: ${doctors.map(d => d.name).join(", ") || "none"}`)
      assert(doctors.some(d => d.id === "leila-shah"))
    } finally { await probe.stop() }
  },
}, "Real OpenAI · mock Zocdoc · no database", !flags.has("--openai") ? "Opt in with --openai." : !process.env.OPENAI_API_KEY ? "OPENAI_API_KEY is missing." : undefined))

// publish a complete report atomically; human judgments belong to the reviewer's export
const runId = crypto.randomUUID()
const report = evalReportSchema.parse({ version: 1, runId, generatedAt: new Date().toISOString(), cases })
await mkdir(".evals", { recursive: true })
const temp = `.evals/${runId}.tmp`
await Bun.write(temp, JSON.stringify(report, null, 2))
await rename(temp, ".evals/latest.json")
const count = (status: EvalResult["status"]) => cases.filter(c => c.status === status).length
console.log(`${count("passed")} passed, ${count("failed")} failed, ${count("skipped")} skipped; ${cases.length} unreviewed. Open the Evals tab.`)
for (const result of cases.filter(c => c.id.startsWith("live-"))) {
  console.log(result.status, result.title, result.error ?? "")
}
if (count("failed") || unavailable || cases.some(c => c.status === "skipped" && flags.has(c.id.replace("live-", "--")))) {
  process.exitCode = 1
}
