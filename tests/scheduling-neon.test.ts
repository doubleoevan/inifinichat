import { SQL } from "bun"
import { expect, test } from "bun:test"
import { demoPatient } from "@/fixtures/demo"
import type { Appointment, Slot } from "@/shared/contracts"

const runNeon = process.env.RUN_NEON_TESTS === "1"

test.skipIf(!runNeon)("real Neon operations survive restart, replay once, exclude conflicts and preserve ownership", async () => {
  // give this test unique IDs and a provider which cannot collide with the app directory
  const key = crypto.randomUUID()
  const doctorId = `probe-${key}`
  const foreign = `foreign-${key}`
  const requestIds: string[] = []
  const command = (fields: Record<string, unknown> = {}) => {
    const requestId = crypto.randomUUID()
    requestIds.push(requestId)
    return { requestId, confirmed: true, ...fields }
  }
  const db = new SQL({ url: process.env.DATABASE_URL!, max: 1 })
  const probe = new Probe(doctorId)

  try {
    await probe.start()
    const slotsPath = `/api/doctors/${doctorId}/availability?locationId=mission`
    const slots = (await probe.ok(slotsPath)) as Slot[]
    const [first, second, third, failed] = slots
    expect(slots).toHaveLength(4)

    // two concurrent requests with the same ID receive exactly the same committed result
    const book = command({ slotId: first.id, notes: "original" })
    const [one, duplicate] = await Promise.all([probe.ok("/api/appointments", "POST", book), probe.ok("/api/appointments", "POST", book)])
    expect(duplicate).toEqual(one)
    const appointmentPath = `/api/appointments/${one.appointment.id}`
    expect((await probe.send("/api/appointments", "POST", { ...book, notes: "different" })).status).toBe(409)
    expect((await probe.send("/api/appointments", "POST", command({ slotId: first.id }))).status).toBe(409)

    // a new Bun process and connection pool can read the same patient, notes and occupied slot
    await probe.restart()
    const schedule = await probe.ok("/api/schedule")
    expect(schedule.source).toBe("neon")
    expect(schedule.patient.id).toBe(demoPatient.id)
    expect(schedule.appointments.find((item: Appointment) => item.id === one.appointment.id)).toEqual(one.appointment)
    expect((await probe.ok(slotsPath)).map((item: Slot) => item.id)).not.toContain(first.id)
    expect(await probe.ok("/api/appointments", "POST", book)).toEqual(one)

    // failed updates roll back both the chosen time and private notes
    const competitors = await Promise.all([1, 2].map(() => probe.send("/api/appointments", "POST", command({ slotId: second.id }))))
    expect(competitors.map(response => response.status).sort()).toEqual([200, 409])
    const occupied = command({ action: "reschedule", slotId: second.id, notes: "must roll back" })
    expect((await probe.send(appointmentPath, "PATCH", occupied)).status).toBe(409)
    const outage = command({ action: "reschedule", slotId: failed.id, notes: "must roll back" })
    expect((await probe.send(appointmentPath, "PATCH", outage)).status).toBe(503)
    const [logged] = await db`SELECT count(*)::int AS n FROM inifinichat_demo.appointment_operations
      WHERE patient_id = ${demoPatient.id} AND request_id IN ${db([occupied.requestId, outage.requestId])}`
    expect(logged.n).toBe(0)
    const after = (await probe.ok("/api/appointments")).find((item: Appointment) => item.id === one.appointment.id)
    expect(after).toEqual(one.appointment)

    // both the atomic reschedule and the local-only note edit persist
    const moved = await probe.ok(appointmentPath, "PATCH", command({ action: "reschedule", slotId: third.id, notes: "changed" }))
    expect([moved.appointment.slotId, moved.appointment.notes]).toEqual([third.id, "changed"])
    const edit = command({ action: "edit-notes", notes: "local only" })
    expect((await probe.ok(appointmentPath, "PATCH", edit)).appointment.notes).toBe("local only")
    expect((await probe.send(appointmentPath, "PATCH", { ...edit, notes: "x".repeat(101) })).status).toBe(400)

    // a real appointment belonging to another owner remains invisible and unmodifiable
    await db.begin(async tx => {
      await tx`INSERT INTO inifinichat_demo.patients (id, name) VALUES (${foreign}, 'Synthetic test owner')`
      await tx`INSERT INTO inifinichat_demo.appointments
        (id, patient_id, doctor, provider_id, location_id, slot_id, time_zone, starts_at, status, notes)
        SELECT ${foreign}, ${foreign}, doctor, provider_id, location_id, slot_id, time_zone, starts_at, 'canceled', ''
        FROM inifinichat_demo.appointments WHERE id = ${one.appointment.id} AND patient_id = ${demoPatient.id}`
    })
    expect((await probe.ok("/api/appointments")).some((item: Appointment) => item.id === foreign)).toBe(false)
    expect((await probe.send(`/api/appointments/${foreign}/cancel`, "POST", command())).status).toBe(404)
    expect((await probe.send(`/api/appointments/${foreign}`, "PATCH", command({ action: "edit-notes", notes: "x" }))).status).toBe(404)

    // a cancellation releases the slot; a replay or new cancellation remains safe
    const cancel = command()
    const [canceled, racingUpdate] = await Promise.all([
      probe.ok(appointmentPath + "/cancel", "POST", cancel),
      probe.send(appointmentPath, "PATCH", command({ action: "reschedule", slotId: first.id })),
    ])
    expect([200, 409]).toContain(racingUpdate.status)
    expect(canceled.appointment.status).toBe("canceled")
    expect(await probe.ok(appointmentPath + "/cancel", "POST", cancel)).toEqual(canceled)
    expect((await probe.ok(appointmentPath + "/cancel", "POST", command())).appointment.status).toBe("canceled")
    const released = (await probe.ok(slotsPath)).map((item: Slot) => item.id)
    expect(released).toContain(third.id)
    expect(released).toContain(first.id)
    expect((await probe.send(appointmentPath, "PATCH", command({ action: "reschedule", slotId: first.id }))).status).toBe(409)
    console.log("Neon PASS: book → Bun restart → same patient, notes and occupied slot → cancel → slot free.")
  } finally {
    // remove only records belonging to this run's synthetic namespace and request IDs
    await probe.stop()
    try {
      await db.begin(async tx => {
        if (requestIds.length) await tx`DELETE FROM inifinichat_demo.appointment_operations
          WHERE patient_id = ${demoPatient.id} AND request_id IN ${tx(requestIds)}`
        await tx`DELETE FROM inifinichat_demo.appointments WHERE provider_id = ${doctorId} AND patient_id IN (${demoPatient.id}, ${foreign})`
        await tx`DELETE FROM inifinichat_demo.patients WHERE id = ${foreign}`
      })
    } finally { await db.close() }
  }
}, 90_000)

test.skipIf(!runNeon)("an unavailable database returns 503 while the fixture directory remains usable", async () => {
  const probe = new Probe(`probe-${crypto.randomUUID()}`, { DATABASE_URL: "postgres://localhost:1/unavailable" })
  try {
    await probe.start()
    const response = await probe.send("/api/appointments")
    expect(response.status).toBe(503)
    expect((await response.json()).code).toBe("database_unavailable")
    expect((await probe.send("/api/doctors")).status).toBe(200)
  } finally { await probe.stop() }
}, 15_000)

class Probe {
  private child?: ReturnType<typeof Bun.spawn>
  private base = ""

  constructor(private doctorId: string, private env: Record<string, string> = {}) {}

  async start() {
    // stdout contains only an ephemeral loopback URL
    const child = Bun.spawn([process.execPath, "tests/support/scheduling-probe.ts", this.doctorId], {
      cwd: process.cwd(), env: { ...process.env, ...this.env }, stdout: "pipe", stderr: "inherit",
    })
    this.child = child
    const reader = child.stdout.getReader()
    try {
      const { value } = await reader.read()
      this.base = new URL(new TextDecoder().decode(value).trim()).origin
    } finally { reader.releaseLock() }
  }

  async stop() {
    this.child?.kill()
    await this.child?.exited
  }

  async restart() { await this.stop(); await this.start() }

  send(path: string, method = "GET", body?: unknown) {
    return fetch(this.base + path, {
      method, headers: { "Content-Type": "application/json", Origin: this.base },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(8000),
    })
  }

  async ok(path: string, method = "GET", body?: unknown) {
    const response = await this.send(path, method, body)
    expect(response.status).toBe(200)
    return response.json()
  }
}
