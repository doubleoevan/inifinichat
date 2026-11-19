import { expect, test } from "bun:test"
import { demoAppointment, slots } from "@/fixtures/demo"
import { appointmentSchema, bookingSchema, intentSchema, limits, makeSlotId, searchSchema, slotSchema, appointmentUpdateSchema } from "@/shared/contracts"
import { exampleBooking, exampleCriteria, exampleIntent, exampleNoteUpdate } from "@/shared/examples"
import { readCommand } from "@/server/http"

test("slot identity survives an equivalent offset and rejects mismatched fixture identity", () => {
  const first = slots[0]
  expect(makeSlotId({ ...first, startsAt: "2030-04-16T10:30:00-07:00" })).toBe(first.id)
  expect(slotSchema.safeParse({ ...first, locationId: "other" }).success).toBe(false)
  expect(appointmentSchema.parse(demoAppointment)).toEqual(demoAppointment)
})

test("criteria, model drafts and confirmed commands have separate schemas", () => {
  expect(searchSchema.parse(exampleCriteria)).toEqual(exampleCriteria)
  expect(searchSchema.safeParse({ query: "Chen", zip: "CA" }).success).toBe(false)
  expect(intentSchema.parse(exampleIntent)).toEqual(exampleIntent)
  expect(bookingSchema.safeParse(exampleIntent).success).toBe(false)
  expect(bookingSchema.safeParse({ ...exampleBooking, patientId: "another" }).success).toBe(false)
  expect(bookingSchema.safeParse({ ...exampleBooking, confirmed: false }).success).toBe(false)
})

test("note commands accept 100 characters and reject 101", async () => {
  const request = (notes: string) => new Request("http://localhost/api/appointments/demo-visit", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...exampleNoteUpdate, notes }),
  })
  const notes = "x".repeat(limits.note)
  expect(await readCommand(request(notes), appointmentUpdateSchema)).toEqual({ input: { ...exampleNoteUpdate, notes } })
  const invalid = await readCommand(request(notes + "x"), appointmentUpdateSchema)
  expect("error" in invalid && invalid.error.status).toBe(400)
  if ("error" in invalid) expect((await invalid.error.json()).code).toBe("invalid_request")
})
