import { expect, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { Appointments } from "@/web/appointments"
import { demoAppointment, doctors, slots } from "@/fixtures/demo"
import { exampleBooking, exampleSlotId } from "@/shared/examples"
import { confirmedCommand, inDateWindow } from "@/web/lib/review"

test("books the displayed shared example slot with a stable request ID", () => {
  const draft = { kind: "book" as const, doctor: doctors[0], slot: slots.find(slot => slot.id === exampleSlotId)! }
  const input = { draft, notes: "", requestId: exampleBooking.requestId }
  expect(confirmedCommand(input)).toEqual({ url: "/api/appointments", method: "POST", body: exampleBooking })
  expect(confirmedCommand(input)).toEqual(confirmedCommand(input))
})

test("edits time and notes together and enforces the shared note limit", () => {
  const input = { draft: { kind: "reschedule" as const, visit: demoAppointment, slot: slots[0] }, notes: "Bring referral", requestId: exampleBooking.requestId }
  expect(confirmedCommand(input)).toEqual({
    url: "/api/appointments/demo-visit", method: "PATCH",
    body: { action: "reschedule", confirmed: true, notes: "Bring referral", requestId: exampleBooking.requestId, slotId: slots[0].id },
  })
  expect(() => confirmedCommand({ ...input, notes: "x".repeat(101) })).toThrow()
})

test("includes the whole selected local day across UTC midnight", () => {
  const slot = { ...slots[0], startsAt: "2030-04-17T01:30:00Z", timeZone: "America/Los_Angeles" }
  expect(inDateWindow(slot, { from: "2030-04-16", through: "2030-04-16" })).toBe(true)
  expect(inDateWindow(slot, { from: "2030-04-17", through: "" })).toBe(false)
})

test("a canceled visit keeps editable local notes and renders their contents as text", () => {
  const canceled = { ...demoAppointment, status: "canceled" as const, notes: "<b>Call clinic</b>" }
  const html = renderToStaticMarkup(createElement(Appointments, { visits: [canceled], onReview: () => {} }))
  expect(html).toContain("Edit notes")
  expect(html).toContain("&lt;b&gt;Call clinic&lt;/b&gt;")
  expect(html).not.toContain("Cancel appointment")
  expect(html).not.toContain("Reschedule")
})
