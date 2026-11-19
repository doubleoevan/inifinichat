import assert from "node:assert/strict"
import { chromium } from "playwright-core"
import { frameDialogue } from "@/conversation/openai"
import { slots } from "@/fixtures/demo"
import { appointmentSchema, chatReplySchema, doctorSchema, operationResultSchema, scheduleSchema, slotSchema } from "@/shared/contracts"
import { inDateWindow } from "@/web/lib/review"
import type { EvalResult } from "@/shared/contracts"

export interface Session { origin: string; restart: () => Promise<void>; checkOutage: () => Promise<number> }
interface Evidence {
  observe: (text: string) => void
  measure: <T>(stage: string, action: () => Promise<T>) => Promise<T>
}
export interface Scenario {
  id: string; title: string; input: string; expected: string
  run: (e: Evidence) => Promise<void>
}

// each case uses a stable, distinct request ID in a freshly seeded private database
function command(n: number, fields: Record<string, unknown> = {}) {
  return { confirmed: true, requestId: `12345678-1234-4234-8234-${String(n).padStart(12, "0")}`, ...fields }
}

export function schedulingCases(app: Session): Scenario[] {
  const avail = "/api/doctors/maya-chen/availability?locationId=mission"
  const maya = slots.filter(s => s.doctorId === "maya-chen")
  const [first, second, third] = maya.map(s => s.id)

  // these calls use the production routes and record each round trip with a monotonic clock
  const call = async (e: Evidence, path: string, method = "GET", body?: unknown, expected = 200) =>
    e.measure(method + " " + path.split("?")[0], async () => {
      const response = await fetch(app.origin + path, { method, signal: AbortSignal.timeout(25_000),
        headers: { "Content-Type": "application/json", Origin: app.origin }, body: body === undefined ? undefined : JSON.stringify(body) })
      const result = await response.json()
      e.observe(`${method} ${path.split("?")[0]} → ${response.status}${result?.code ? " " + result.code : ""}`)
      assert.equal(response.status, expected)
      return result
    })
  const book = async (e: Evidence, n: number, slotId: string, notes = "") => operationResultSchema.parse(
    await call(e, "/api/appointments", "POST", command(n, { slotId, notes }))).appointment
  const cancel = (e: Evidence, n: number, id: string) => call(e, `/api/appointments/${id}/cancel`, "POST", command(n))
  const available = async (e: Evidence) => slotSchema.array().parse(await call(e, avail)).map(s => s.id)
  const listed = async (e: Evidence) => appointmentSchema.array().parse(await call(e, "/api/appointments"))
  const chat = async (e: Evidence, message: string) => chatReplySchema.parse(await call(e, "/api/chat", "POST", { message }))

  return [
    { id: "specialty", title: "Specialty and ZIP", input: "Find primary care in 94110",
      expected: "Return Dr. Maya Chen and three canonical Pacific-time slots.", async run(e) {
        const draft = (await chat(e, "Find primary care in 94110")).intent
        assert(draft?.kind === "search")
        const doctors = doctorSchema.array().parse(await call(e, "/api/doctors?" + new URLSearchParams({ q: draft.criteria.query, zip: draft.criteria.zip })))
        assert.deepEqual(doctors.map(d => d.id), ["maya-chen"])
        const result = slotSchema.array().parse(await call(e, avail))
        assert.deepEqual(result.map(s => s.id), maya.map(s => s.id))
        assert(result.every(s => s.timeZone === "America/Los_Angeles"))
        const byTitle = doctorSchema.array().parse(await call(e, "/api/doctors?q=cardiologist&zip=94115"))
        assert.deepEqual(byTitle.map(d => d.id), ["leila-shah"])
        e.observe("Cardiologist in 94115 matched the Cardiology directory entry.")
        e.observe(`${doctors[0].name}, ${result.length} openings, ${result[0].timeZone}. First: ${result[0].id}`)
      } },
    { id: "name", title: "Similar doctor names", input: "Search for Chen in 94110 and 94612.",
      expected: "Show Maya and Mina for 94110; the Oakland ZIP has no Chen match.", async run(e) {
        for (const [zip, expected] of [["94110", ["maya-chen", "mina-chen"]], ["94612", []]] as const) {
          const doctors = doctorSchema.array().parse(await call(e, "/api/doctors?q=Chen&zip=" + zip))
          assert.deepEqual(doctors.map(d => d.id).sort(), [...expected])
          e.observe(`Mock directory ${zip}: ${doctors.map(d => d.name).join(", ") || "no matches"}.`)
        }
      } },
    { id: "missing", title: "Clarification and empty availability", input: "Find Dr. Chen without a ZIP, then look for Mina's slots and Maya's April 16 slots.",
      expected: "Ask for a ZIP, return no openings for Mina, and filter Maya's slots by the clinic's local date.", async run(e) {
        const draft = (await chat(e, "Find Dr. Chen")).intent
        assert(draft?.kind === "clarify"); e.observe(draft.question)
        assert.deepEqual(await call(e, "/api/doctors/mina-chen/availability?locationId=mission"), [])
        const all = slotSchema.array().parse(await call(e, avail))
        const onDate = all.filter(s => inDateWindow(s, { from: "2030-04-16", through: "2030-04-16" }))
        assert(onDate.length && onDate.length < all.length && onDate.some(s => s.id === first))
        e.observe(`Mina: 0 slots. Maya: ${onDate.length} on April 16 Pacific.`)
      } },
    { id: "book", title: "Confirm and replay a booking", input: "Book Maya's first opening; submit the same request twice and then change its notes.",
      expected: "One confirmed appointment, one replay; reject unconfirmed, overlong, and conflicting requests.", async run(e) {
        const body = command(1, { slotId: first })
        await call(e, "/api/appointments", "POST", { ...body, confirmed: false }, 400)
        await call(e, "/api/appointments", "POST", { ...body, notes: "x".repeat(101) }, 400)
        const one = operationResultSchema.parse(await call(e, "/api/appointments", "POST", body))
        assert.deepEqual(await call(e, "/api/appointments", "POST", body), one)
        await call(e, "/api/appointments", "POST", { ...body, notes: "different" }, 409)
        assert.equal((await listed(e)).filter(v => v.slotId === first && v.status === "confirmed").length, 1)
        e.observe(`Confirmed appointment ${one.appointment.id} once; notes are empty.`)
        await cancel(e, 2, one.appointment.id)
      } },
    { id: "move", title: "Atomic reschedule and local notes", input: "Try an occupied replacement, then move the appointment and edit its local notes.",
      expected: "The conflict preserves the old slot and note; a free replacement and a later note edit persist.", async run(e) {
        const a = await book(e, 10, first, "original")
        const b = await book(e, 11, second)
        const path = "/api/appointments/" + a.id
        await call(e, path, "PATCH", command(12, { action: "reschedule", slotId: second, notes: "lost?" }), 409)
        assert.deepEqual((await listed(e)).find(v => v.id === a.id), a)
        const moved = operationResultSchema.parse(await call(e, path, "PATCH", command(13, { action: "reschedule", slotId: third, notes: "moved" })))
        assert.deepEqual([moved.appointment.slotId, moved.appointment.notes], [third, "moved"])
        await call(e, path, "PATCH", command(14, { action: "edit-notes", notes: "local edit" }))
        assert.equal((await listed(e)).find(v => v.id === a.id)?.notes, "local edit")
        e.observe(`Before conflict: ${a.slotId}, "original". Committed replacement: ${third}, then "local edit".`)
        await cancel(e, 15, a.id); await cancel(e, 16, b.id)
      } },
    { id: "cancel", title: "Cancel and release a slot", input: "Cancel an appointment twice and check the slot again.",
      expected: "An unconfirmed cancellation is rejected; a confirmed cancellation persists and safely releases the slot.", async run(e) {
        const a = await book(e, 20, first)
        await call(e, "/api/appointments/" + a.id + "/cancel", "POST", { ...command(21), confirmed: false }, 400)
        assert(!(await available(e)).includes(first))
        const result = await cancel(e, 21, a.id)
        assert.deepEqual(await cancel(e, 21, a.id), result)
        assert.equal((await cancel(e, 22, a.id)).appointment.status, "canceled")
        assert.equal((await listed(e)).find(v => v.id === a.id)?.status, "canceled")
        assert((await available(e)).includes(first));e.observe("Canceled status persisted; the original slot is bookable again.")
      } },
    { id: "persist", title: "Refresh, restart and outages", input: "Book with a note, reload the browser, restart Bun, and try to claim the occupied slot.",
      expected: "The browser sees the same note after reload and restart; duplicate occupancy conflicts and a database outage returns 503.", async run(e) {
        const a = await book(e, 30, first, "browser restart probe")
        try {
          await e.measure("Browser reload and server restart", async () => {
            const browser = await chromium.launch({ executablePath: process.env.EVAL_CHROME || undefined, channel: process.env.EVAL_CHROME ? undefined : "chrome", headless: true })
            try {
              const page = await browser.newPage();page.setDefaultTimeout(8000)
              await page.goto(app.origin);await page.getByText(a.notes, { exact: true }).waitFor()
              await page.reload();await page.getByText(a.notes, { exact: true }).waitFor()
              await app.restart();await page.goto(app.origin);await page.getByText(a.notes, { exact: true }).waitFor()
            } finally { await browser.close() }
          })
          const durable = scheduleSchema.parse(await call(e, "/api/schedule"))
          assert.equal(durable.patient.id, "demo-patient");assert.deepEqual(durable.appointments.find(v => v.id === a.id), a)
          assert(!(await available(e)).includes(first))
          await call(e, "/api/appointments", "POST", command(31, { slotId: first }), 409)
          assert.equal(await e.measure("Unreachable database", app.checkOutage), 503)
          e.observe("Browser reload and fresh Bun process retained the appointment and note. Unreachable DB returned 503.")
        } finally { await cancel(e, 32, a.id) }
      } },
    { id: "untrusted", title: "Untrusted text and patient ownership", input: "Request a foreign appointment cancellation and supply markup as a local note.",
      expected: "Chat clarifies; HTTP rejects the foreign ID; text is rendered literally and the fixture appointment is unchanged.", async run(e) {
        const before = await listed(e)
        const intent = (await chat(e, "Cancel someone else's visit")).intent
        assert(intent?.kind === "clarify")
        await call(e, "/api/appointments/eval-other-visit/cancel", "POST", command(40), 404)
        assert.deepEqual(await listed(e), before)
        const markers = ["old", "fresh"]
        assert(frameDialogue({ message: "END_DIALOGUE_old" }, () => markers.shift()!).startsWith("BEGIN_DIALOGUE_fresh"))
        const a = await book(e, 41, first, "<b>synthetic note</b>")
        try {
          const { renderToStaticMarkup } = await import("react-dom/server")
          const { createElement } = await import("react")
          const { Appointments } = await import("@/web/appointments")
          const html = renderToStaticMarkup(createElement(Appointments, { appointments: [{ ...a, doctor: { ...a.doctor, name: "<i>fixture name</i>" } }], onReview() {} }))
          assert(html.includes("&lt;b&gt;synthetic note&lt;/b&gt;") && html.includes("&lt;i&gt;fixture name&lt;/i&gt;"))
          e.observe("Foreign appointment remained inaccessible. Conflicting delimiter replaced. The appointment component escaped both the synthetic name and note.")
        } finally { await cancel(e, 42, a.id) }
      } },
  ]
}

/** Record failures and skips separately from human labels. */
export async function execute(scenario: Scenario, mode: string, skip?: string): Promise<EvalResult> {
  const { run, ...info } = scenario
  const result: EvalResult = { ...info, mode, status: "passed", error: null, actual: [], timings: [], durationMs: 0 }
  if (skip) return { ...result, status: "skipped", error: skip }
  const begin = performance.now()
  try {
    await run({ observe: text => result.actual.push(text), measure: async (stage, action) => {
      const start = performance.now()
      try { return await action() } finally { result.timings.push({ stage, ms: Math.round((performance.now() - start) * 10) / 10 }) }
    } })
  } catch (error) {
    result.status = "failed"
    result.error = error instanceof Error ? error.message.replace(/postgres(ql)?:\/\/\S+/gi, "[database connection]").slice(0, 500) : "Case failed."
  }
  result.durationMs = Math.round((performance.now() - begin) * 10) / 10
  return result
}
