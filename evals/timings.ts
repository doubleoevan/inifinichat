import { evalReportSchema, type EvalReport } from "@/shared/contracts"

// sample the same workflows across reports, including failed or skipped probes
const sample = ["specialty", "book", "persist", "live-neon", "live-openai"]

/** Render the runner's recorded totals and stage timings in milliseconds. */
export function formatTimings(report: EvalReport): string {
  const lines = [`Eval run ${report.runId} · ${report.generatedAt}`]
  for (const id of sample) {
    const result = report.cases.find(item => item.id === id)
    if (!result) {
      lines.push("", `${id} · absent from this report`)
      continue
    }

    // the runner writes zero duration for skipped cases before starting its timer
    const total = result.status === "skipped" ? "unmeasured" : `${result.durationMs} ms total`
    lines.push("", `${result.title} · ${result.status} · ${total}`, `  ${result.mode}`)
    for (const { stage, ms } of result.timings) lines.push(`  ${stage} · ${ms} ms`)
    if (result.error) lines.push(`  ${result.status === "skipped" ? "Skip reason" : "Error"}: ${result.error}`)
  }
  return lines.join("\n")
}

if (import.meta.main) {
  // labeled browser exports and the local report share the same timing schema
  const path = Bun.argv[2] ?? ".evals/latest.json"
  try {
    const report = evalReportSchema.parse(await Bun.file(path).json())
    console.log(formatTimings(report))
  } catch {
    console.error(`Could not read a valid scheduling eval report at ${path}. Supply an existing eval JSON file.`)
    process.exitCode = 1
  }
}
