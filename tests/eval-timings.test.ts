import { expect, test } from "bun:test"
import type { EvalResult } from "@/shared/contracts"
import { formatTimings } from "../evals/timings"

test("retains ordered stage samples, measured failures and unmeasured skips", () => {
  const failure: EvalResult = {
    id: "book", title: "Booking", mode: "fixture", status: "failed",
    input: "", expected: "", actual: [], error: "Conflict", durationMs: 3,
    timings: [{ stage: "POST", ms: 2 }, { stage: "POST", ms: 0 }],
  }
  const skipped: EvalResult = { ...failure, id: "live-openai", title: "Chat", mode: "OpenAI",
    status: "skipped", durationMs: 0, timings: [], error: "Opt in with --openai." }
  const text = formatTimings({ version: 1, runId: "test", generatedAt: "2030-01-01T00:00:00Z", cases: [failure, skipped] })

  expect(text).toContain("Booking · failed · 3 ms total\n  fixture\n  POST · 2 ms\n  POST · 0 ms\n  Error: Conflict")
  expect(text).toContain("Chat · skipped · unmeasured\n  OpenAI\n  Skip reason: Opt in with --openai.")
  expect(text).toContain("live-neon · absent from this report")
})
