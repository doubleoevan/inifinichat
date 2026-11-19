import { expect, test } from "bun:test"
import { demoAppointment, doctors, slots } from "@/fixtures/demo"
import { limits, makeSlotId, slotSchema } from "@/shared/contracts"
import { exampleBooking, exampleSlotId } from "@/shared/examples"
import { createMockZocdoc, listDemoDoctors } from "@/zocdoc/mock"

// a fixed clock before the fixture schedule keeps every test repeatable
const beforeWindow = () => Date.parse("2030-04-15T12:00:00Z")
const adapter = createMockZocdoc({ now: beforeWindow })
const mission = { doctorId: "maya-chen", locationId: "mission" }
const change = { appointmentId: demoAppointment.id, requestId: exampleBooking.requestId }

test("searches name or specialty within a ZIP and returns ambiguous names", async () => {
  // match by either search field using the same public directory
  expect(await adapter.searchProviders({ query: "  primary  ", zip: "94110" })).toEqual(doctors.filter(doctor => doctor.id === "maya-chen"))
  expect(await adapter.searchProviders({ query: "cHeN", zip: "94110" })).toEqual(doctors.filter(doctor => doctor.name.endsWith("Chen")))
  expect(await adapter.searchProviders({ query: "Chen", zip: "94612" })).toEqual([])
  expect((await adapter.searchProviders({ query: "Ellis", zip: "94612" })).map(doctor => doctor.id)).toEqual(["noah-ellis"])
  expect(listDemoDoctors()).toEqual(doctors)

  // reject invalid search inputs at the adapter boundary
  await expect(adapter.searchProviders({ query: " ", zip: "94110" })).rejects.toMatchObject({ code: "invalid_request" })
  await expect(adapter.searchProviders({ query: "Chen", zip: "CA" })).rejects.toMatchObject({ code: "invalid_request" })
})

test("offers bounded, chronological and nonoverlapping half-hour slots at each known location", async () => {
  // validate every synthetic time and its canonical identity
  for (const doctor of doctors) {
    const available = await adapter.getAvailability({ doctorId: doctor.id, locationId: doctor.locationId })
    expect(available.length).toBeLessThanOrEqual(limits.candidates)
    expect(available).toEqual(slots.filter(slot => slot.doctorId === doctor.id && slot.locationId === doctor.locationId))
    let previous = -Infinity
    for (const slot of available) {
      expect(slotSchema.parse(slot)).toEqual(slot)
      expect(slot.timeZone).toBe(doctor.timeZone)
      expect(Date.parse(slot.startsAt) - previous).toBeGreaterThanOrEqual(30 * 60_000)
      previous = Date.parse(slot.startsAt)
    }
  }

  // distinguish a known empty practice schedule from a mismatched or malformed location
  expect(await adapter.getAvailability({ doctorId: "mina-chen", locationId: "mission" })).toEqual([])
  await expect(adapter.getAvailability({ ...mission, locationId: "east-bay" })).rejects.toMatchObject({ code: "not_found" })
  await expect(adapter.getAvailability({ ...mission, doctorId: "missing" })).rejects.toMatchObject({ code: "not_found" })
  await expect(adapter.getAvailability({ ...mission, locationId: "../" })).rejects.toMatchObject({ code: "invalid_request" })
})

test("uses absolute instants and drops started slots without shifting future IDs", async () => {
  // advance the clock to the first opening and keep later candidates exactly as listed
  const atOpening = createMockZocdoc({ now: () => Date.parse("2030-04-16T10:30:00-07:00") })
  const all = await adapter.getAvailability(mission)
  expect(all[0].id).toBe(exampleSlotId)
  expect(await atOpening.getAvailability(mission)).toEqual(all.slice(1))
  await expect(atOpening.bookAppointment(exampleBooking)).rejects.toMatchObject({ code: "conflict" })
  await expect(atOpening.rescheduleAppointment({ ...change, slotId: exampleSlotId })).rejects.toMatchObject({ code: "conflict" })
})

test("restarting Bun produces identical canonical slot IDs", () => {
  // start independent processes with the same clock and public provider entry point
  const script = [
    'import { createMockZocdoc } from "./src/zocdoc/mock.ts";',
    'const provider = createMockZocdoc({ now: () => Date.parse("2030-04-15T12:00:00Z") });',
    'const slots = await provider.getAvailability({ doctorId: "maya-chen", locationId: "mission" });',
    'console.log(JSON.stringify(slots.map(slot => slot.id)));',
  ].join("\n")
  const ids = Array.from({ length: 2 }, () => {
    const run = Bun.spawnSync([process.execPath, "-e", script])
    expect(run.exitCode).toBe(0)
    return JSON.parse(run.stdout.toString())
  })
  expect(ids[0]).toContain(exampleSlotId)
  expect(ids[1]).toEqual(ids[0])
})

test("acknowledges valid writes deterministically and leaves the candidate inventory intact", async () => {
  // repeat all operations and observe the same references without modifying slots
  const before = await adapter.getAvailability(mission)
  expect(await adapter.bookAppointment(exampleBooking)).toEqual({ providerReference: `mock-book-${change.requestId}` })
  expect(await adapter.bookAppointment(exampleBooking)).toEqual(await adapter.bookAppointment({ ...exampleBooking, notes: "Local note" }))
  const replacement = { ...change, slotId: before[1].id }
  expect(await adapter.rescheduleAppointment(replacement)).toEqual({ providerReference: `mock-reschedule-${change.requestId}` })
  expect(await adapter.cancelAppointment(change)).toEqual({ providerReference: `mock-cancel-${change.requestId}` })
  expect(await adapter.getAvailability(mission)).toEqual(before)
})

test("rejects unknown slots, malformed IDs and notes over the shared limit", async () => {
  // distinguish unknown canonical slot IDs from invalid command shapes
  const unknown = makeSlotId({ ...mission, startsAt: "2030-04-16T23:15:00Z" })
  await expect(adapter.bookAppointment({ ...exampleBooking, slotId: unknown })).rejects.toMatchObject({ code: "not_found" })
  await expect(adapter.rescheduleAppointment({ ...change, slotId: unknown })).rejects.toMatchObject({ code: "not_found" })
  await expect(adapter.rescheduleAppointment({ ...change, slotId: "bad" })).rejects.toMatchObject({ code: "invalid_request" })
  await expect(adapter.cancelAppointment({ ...change, appointmentId: "?" })).rejects.toMatchObject({ code: "invalid_request" })
  await expect(adapter.cancelAppointment({ ...change, requestId: "bad" })).rejects.toMatchObject({ code: "invalid_request" })
  await expect(adapter.bookAppointment({ ...exampleBooking, notes: "x".repeat(limits.note + 1) })).rejects.toMatchObject({ code: "invalid_request" })
})

test("injects repeatable provider failures into only the chosen operation", async () => {
  // use the same seam for conflict and service failure tests
  for (const code of ["conflict", "provider_unavailable"] as const) {
    const failing = createMockZocdoc({ now: beforeWindow, failure: { operation: "rescheduleAppointment", code } })
    const command = { ...change, slotId: exampleSlotId }
    await expect(failing.rescheduleAppointment(command)).rejects.toMatchObject({ code })
    await expect(failing.rescheduleAppointment(command)).rejects.toMatchObject({ code })
    expect(await failing.bookAppointment(exampleBooking)).toEqual(await adapter.bookAppointment(exampleBooking))
  }
})
