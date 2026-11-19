import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { chromium } from "playwright-core"
import type { EvalReport } from "@/shared/contracts"
import { startProbe } from "./local"

// use a simulated review record so browser QA never supplies a human judgment for a real case
const report: EvalReport = { version: 1, runId: "review-example", generatedAt: new Date().toISOString(), cases: [{
  id: "example", title: "Review example", status: "passed", mode: "Synthetic UI fixture",
  input: "A sample input", expected: "An observation", actual: ["Observed example"], error: null, durationMs: 1,
  timings: [{ stage: "Fixture", ms: 1 }],
}] }
const app = await startProbe("")
try {
  const browser = await chromium.launch({ channel: process.env.EVAL_CHROME ? undefined : "chrome", executablePath: process.env.EVAL_CHROME || undefined })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await page.route("**/api/evals", route => route.fulfill({ json: report }))
    await page.goto(app.origin)
    const tab = page.getByRole("button", { name: "Evals", exact: true })
    await tab.click()
    await page.getByText(/1 unreviewed/).waitFor()
    await page.getByText("Review example", { exact: true }).click()
    await page.getByLabel("Human label").selectOption("Unsure")
    await page.getByLabel("Reviewer notes").fill("Synthetic review export check")
    await page.getByRole("button", { name: "Appointments", exact: true }).click()
    await tab.click()
    assert.equal(await page.getByLabel("Human label").inputValue(), "Unsure")
    const download = page.waitForEvent("download")
    await page.getByRole("button", { name: "Export JSON" }).click()
    const path = await (await download).path()
    assert(path)
    const saved = JSON.parse(await readFile(path, "utf8"))
    assert.deepEqual(saved.cases[0].review, { label: "Unsure", notes: "Synthetic review export check" })
    assert.deepEqual(saved.cases[0].actual, report.cases[0].actual)
    await page.reload();await tab.click()
    await page.getByText(/1 unreviewed/).waitFor()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    console.log("Review UI passed: initial labels, tab navigation, notes, JSON export, refresh reset and mobile layout.")
  } finally { await browser.close() }
} finally { await app.stop() }
