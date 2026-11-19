import { useEffect, useState } from "react"
import { Download, RefreshCw } from "lucide-react"
import { evalReportSchema, type EvalReport } from "@/shared/contracts"
import { Textarea } from "./components/ui/textarea"

const labels = ["Unreviewed", "Pass", "Fail", "Unsure"] as const
type Review = { label: typeof labels[number]; notes: string }
const emptyReview: Review = { label: "Unreviewed", notes: "" }

/** Compare observed evidence with the expected behavior and export independent human judgments. */
export function Evals() {
  const [report, setReport] = useState<EvalReport>()
  const [reviews, setReviews] = useState<Record<string, Review>>({})
  const [notice, setNotice] = useState("")
  const [loading, setLoading] = useState(true)

  async function handleLoad(signal?: AbortSignal) {
    setLoading(true)
    try {
      const response = await fetch("/api/evals", { cache: "no-store", signal })
      if (response.status === 404) throw new Error("Run bun run evals in the project folder, then load the results here.")
      if (!response.ok) throw new Error("The evaluation report could not be loaded.")
      const next = evalReportSchema.parse(await response.json())
      if (signal?.aborted) return
      if (report && next.runId !== report.runId && Object.values(reviews).some(r => r.label !== "Unreviewed" || r.notes)) {
        if (!window.confirm("Open the new run and discard this run’s unexported reviews?")) return
      }
      if (next.runId !== report?.runId) setReviews({})
      setReport(next);setNotice("")
    } catch (error) {
      if (!signal?.aborted) setNotice(error instanceof Error ? error.message : "The report could not be loaded.")
    } finally { if (!signal?.aborted) setLoading(false) }
  }

  // access to the tab only reads the report; running the CLI is an explicit local action
  useEffect(() => {
    const controller = new AbortController()
    void handleLoad(controller.signal)
    return () => controller.abort()
  }, [])

  function handleExport() {
    if (!report) return
    const saved = { ...report, cases: report.cases.map(c => ({ ...c, review: reviews[c.id] ?? emptyReview })) }
    const url = URL.createObjectURL(new Blob([JSON.stringify(saved, null, 2)], { type: "application/json" }))
    const link = document.createElement("a")
    link.href = url;link.download = `inifinichat-evals-${report.runId}.json`;link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <section className="evals" aria-labelledby="evals-heading">
    <div className="evals-heading"><h2 id="evals-heading">Scheduling evals</h2>
      <button className="secondary" disabled={loading} onClick={() => void handleLoad()}><RefreshCw size={15} />Load latest</button></div>
    {notice && <p role="status">{notice}</p>}
    {loading && <p role="status">Loading results…</p>}
    {report && <>
      <p>{report.cases.filter(c => c.status === "passed").length} passed · {report.cases.filter(c => c.status === "failed").length} failed · {report.cases.filter(c => c.status === "skipped").length} skipped · {report.cases.filter(c => (reviews[c.id]?.label ?? "Unreviewed") === "Unreviewed").length} unreviewed</p>
      <div className="evals-export"><p>Run from {new Date(report.generatedAt).toLocaleString()}. Export your labels and notes before refreshing.</p>
        <button className="primary" onClick={handleExport}><Download size={15} />Export JSON</button></div>
      {report.cases.map(c => {
        const review = reviews[c.id] ?? emptyReview
        const update = (changes: Partial<Review>) => setReviews(current => ({ ...current, [c.id]: { ...(current[c.id] ?? emptyReview), ...changes } }))
        return <details className="panel eval-case" key={c.id}>
          <summary><strong>{c.title}</strong><span>{c.status} · {c.durationMs} ms · {review.label}</span></summary>
          <dl><dt>Input</dt><dd>{c.input}</dd><dt>Expected</dt><dd>{c.expected}</dd>
            <dt>Execution mode</dt><dd>{c.mode}</dd><dt>Actual output and state</dt>
            <dd>{c.actual.length ? <ul>{c.actual.map((line, i) => <li key={i}>{line}</li>)}</ul> : "No observations recorded."}</dd>
            {c.error && <><dt>{c.status === "skipped" ? "Skipped because" : "Error"}</dt><dd>{c.error}</dd></>}
          </dl>
          {c.timings.length > 0 && <details className="eval-timings"><summary>Stage timings</summary>
            <ul>{c.timings.map((t, i) => <li key={i}>{t.stage} · {t.ms} ms</li>)}</ul></details>}
          <label htmlFor={c.id + "-label"}>Human label</label>
          <select id={c.id + "-label"} value={review.label} onChange={event => update({ label: event.target.value as Review["label"] })}>
            {labels.map(label => <option key={label}>{label}</option>)}</select>
          <label htmlFor={c.id + "-notes"}>Reviewer notes</label>
          <Textarea id={c.id + "-notes"} value={review.notes} rows={2} onChange={event => update({ notes: event.target.value })} />
        </details>
      })}
    </>}
  </section>
}
