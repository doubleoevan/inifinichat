import type { SQL } from "bun"
import { createHash } from "node:crypto"
import type { z } from "zod"
import { demoPatient } from "@/fixtures/demo"
import { bookingSchema, cancellationSchema, operationResultSchema, slotSchema, visitUpdateSchema,
  type ApiError, type Appointment, type Doctor, type SchedulingAdapter } from "@/shared/contracts"
import { appointmentFromRow } from "./appointment"

export type AppointmentCommand =
  | { kind: "book"; data: z.infer<typeof bookingSchema> }
  | { kind: "cancel"; id: string; data: z.infer<typeof cancellationSchema> }
  | { kind: "update"; id: string; data: z.infer<typeof visitUpdateSchema> }

export interface Directory {
  adapter: SchedulingAdapter
  listDoctors: () => Doctor[]
}

export class SchedulingError extends Error {
  constructor(public readonly code: ApiError["code"], message: string) { super(message) }
}

/** Commit a patient-owned change and its exact replay result together. */
export async function changeAppointment(db: SQL, directory: Directory, command: AppointmentCommand) {
  // the HTTP schemas produce a consistent field order across equivalent JSON requests
  const requestId = command.data.requestId
  const hash = createHash("sha256").update(JSON.stringify(command)).digest("hex")

  try {
    return await db.begin(async tx => {
      // serialize this one patient's confirmed operations and concurrent replays
      const [patient] = await tx`SELECT id FROM inifinichat_demo.patients WHERE id = ${demoPatient.id} FOR UPDATE`
      if (!patient) throw new Error("Missing synthetic patient.")
      const [prior] = await tx`SELECT payload_hash, result FROM inifinichat_demo.appointment_operations
        WHERE patient_id = ${patient.id} AND request_id = ${requestId}`
      if (prior) {
        if (hash !== prior.payload_hash) throw new SchedulingError("conflict", "This request ID was already used for a different change.")
        return operationResultSchema.parse(prior.result)
      }

      // only a validated in-process mock acknowledgement can precede an appointment change
      const appointment = command.kind === "book"
        ? await book(tx, directory, command.data)
        : await update(tx, directory, command)
      const result = operationResultSchema.parse({ requestId, appointment })
      await tx`INSERT INTO inifinichat_demo.appointment_operations (patient_id, request_id, payload_hash, result)
        VALUES (${patient.id}, ${requestId}, ${hash}, ${JSON.stringify(result)}::text::jsonb)`
      return result
    })
  } catch (error) {
    // a competing patient or request can claim the same slot before commit
    if (error && typeof error === "object" && "errno" in error && error.errno === "23505" &&
        "constraint" in error && error.constraint === "appointments_confirmed_slot") {
      throw new SchedulingError("conflict", "That slot is already booked. Choose another time.")
    }
    throw error
  }
}

async function book(tx: SQL, directory: Directory, data: z.infer<typeof bookingSchema>): Promise<Appointment> {
  // resolve the snapshot locally and exclude the patient's private notes from the provider call
  const { doctor, slot } = await resolveSlot(directory, data.slotId)
  await acknowledge(() => directory.adapter.bookAppointment({ slotId: slot.id, requestId: data.requestId, confirmed: true }))
  const [row] = await tx`INSERT INTO inifinichat_demo.appointments
    (id, patient_id, doctor, provider_id, location_id, slot_id, starts_at, time_zone, status, notes)
    VALUES (${crypto.randomUUID()}, ${demoPatient.id}, ${JSON.stringify(doctor)}::text::jsonb, ${doctor.id},
      ${doctor.locationId}, ${slot.id}, ${slot.startsAt}, ${slot.timeZone}, 'confirmed', ${data.notes ?? ""}) RETURNING *`
  return appointmentFromRow(row)
}

async function update(tx: SQL, directory: Directory, command: Exclude<AppointmentCommand, { kind: "book" }>): Promise<Appointment> {
  // lock and check ownership before trusting any client-supplied appointment ID
  const [row] = await tx`SELECT * FROM inifinichat_demo.appointments
    WHERE id = ${command.id} AND patient_id = ${demoPatient.id} FOR UPDATE`
  if (!row) throw new SchedulingError("not_found", "Appointment not found.")
  const current = appointmentFromRow(row)
  if (command.kind === "cancel") {
    if (current.status === "canceled") return current
    await acknowledge(() => directory.adapter.cancelAppointment({ appointmentId: current.id, requestId: command.data.requestId }))
    const [canceled] = await tx`UPDATE inifinichat_demo.appointments SET status = 'canceled', updated_at = now()
      WHERE id = ${current.id} AND patient_id = ${demoPatient.id} RETURNING *`
    return appointmentFromRow(canceled)
  }

  // local note edits do not invoke the provider
  const data = command.data
  if (data.action === "edit-notes") {
    const [edited] = await tx`UPDATE inifinichat_demo.appointments SET notes = ${data.notes}, updated_at = now()
      WHERE id = ${current.id} AND patient_id = ${demoPatient.id} RETURNING *`
    return appointmentFromRow(edited)
  }

  // the locked appointment remains unchanged unless the new time and notes both commit
  if (current.status !== "confirmed") throw new SchedulingError("conflict", "A canceled appointment cannot be rescheduled.")
  const { doctor, slot } = await resolveSlot(directory, data.slotId)
  if (doctor.id !== current.doctor.id || doctor.locationId !== current.doctor.locationId || slot.id === current.slotId) {
    throw new SchedulingError("invalid_request", "Choose a different time with the same doctor and location.")
  }
  await acknowledge(() => directory.adapter.rescheduleAppointment({ appointmentId: current.id, slotId: slot.id, requestId: data.requestId }))
  const [changed] = await tx`UPDATE inifinichat_demo.appointments SET
    slot_id = ${slot.id}, starts_at = ${slot.startsAt}, notes = ${data.notes ?? current.notes}, updated_at = now()
    WHERE id = ${current.id} AND patient_id = ${demoPatient.id} RETURNING *`
  return appointmentFromRow(changed)
}

/** Match the full canonical slot to a provider's candidate at this location. */
export async function resolveSlot(directory: Directory, slotId: string) {
  const [doctorId, locationId] = slotId.split("/")
  const doctor = directory.listDoctors().find(candidate => candidate.id === doctorId && candidate.locationId === locationId)
  if (!doctor) throw new SchedulingError("not_found", "Provider location not found.")
  const candidates = await providerCall(() => directory.adapter.getAvailability({ doctorId, locationId }))
  const candidate = candidates.find(slot => slot.id === slotId)
  if (!candidate) throw new SchedulingError("not_found", "This slot is no longer offered.")
  const slot = slotSchema.safeParse(candidate)
  if (!slot.success || slot.data.timeZone !== doctor.timeZone) {
    throw new SchedulingError("provider_unavailable", "The provider returned an invalid slot.")
  }
  return { doctor, slot: slot.data }
}

/** Map a provider failure to a stable public code and safe text. */
export async function providerCall<T>(call: () => Promise<T>): Promise<T> {
  try { return await call() } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined
    switch (code) {
      case "conflict": throw new SchedulingError(code, "The provider reports a scheduling conflict.")
      case "not_found": throw new SchedulingError(code, "The provider could not find the requested item.")
      case "invalid_request": throw new SchedulingError(code, "The provider rejected the scheduling request.")
      default: throw new SchedulingError("provider_unavailable", "The scheduling provider is unavailable.")
    }
  }
}

async function acknowledge(call: () => Promise<{ providerReference: string }>) {
  const receipt = await providerCall(call)
  if (!receipt || typeof receipt.providerReference !== "string" || !receipt.providerReference.trim() || receipt.providerReference.length > 200) {
    throw new SchedulingError("provider_unavailable", "The scheduling provider returned an invalid acknowledgement.")
  }
}
