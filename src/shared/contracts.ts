import { z } from "zod"

// limits shared by HTTP validation, the browser and the model caller
export const limits = {
  bodyBytes: 8192, message: 1500, historyTurns: 6, note: 100, search: 80,
  outputTokens: 250, timeoutMs: 20_000, candidates: 25,
} as const
export const idSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/)
export const requestIdSchema = z.uuid()
export const zipSchema = z.string().regex(/^\d{5}$/)
export const noteSchema = z.string().max(limits.note)
export const instantSchema = z.iso.datetime({ offset: true })
const timeZoneSchema = z.string().max(64).refine(zone => {
  try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true } catch { return false }
})

/**
 * Identifies a slot by provider, location and normalized UTC instant.
 */
export function makeSlotId(slot: { doctorId: string; locationId: string; startsAt: string }): string {
  return [idSchema.parse(slot.doctorId), idSchema.parse(slot.locationId), new Date(instantSchema.parse(slot.startsAt)).toISOString()].join("/")
}

export const slotIdSchema = z.string().max(190).refine(value => {
  const [doctorId, locationId, startsAt, ...rest] = value.split("/")
  if (!startsAt || rest.length || !idSchema.safeParse(doctorId).success || !idSchema.safeParse(locationId).success) return false
  return instantSchema.safeParse(startsAt).success && new Date(startsAt).toISOString() === startsAt
})

// public patient, provider location and appointment snapshots
export const profileUpdateSchema = z.strictObject({ name: z.string().trim().min(1).max(100) })
export const patientSchema = profileUpdateSchema.extend({ id: idSchema })
export const doctorSchema = z.strictObject({
  id: idSchema, name: z.string().min(1), specialty: z.string().min(1), practice: z.string().min(1),
  location: z.string().min(1), locationId: idSchema, zip: zipSchema, timeZone: timeZoneSchema,
})
export const searchSchema = z.strictObject({ query: z.string().trim().min(1).max(limits.search), zip: zipSchema })
export const slotSchema = z.strictObject({
  id: slotIdSchema, doctorId: idSchema, locationId: idSchema, startsAt: instantSchema, timeZone: timeZoneSchema,
}).refine(slot => slot.id === makeSlotId(slot))
export const appointmentSchema = z.strictObject({
  id: idSchema, doctor: doctorSchema, slotId: slotIdSchema, startsAt: instantSchema,
  status: z.enum(["confirmed", "canceled"]), notes: noteSchema,
}).refine(visit => visit.slotId === makeSlotId({ doctorId: visit.doctor.id, locationId: visit.doctor.locationId, startsAt: visit.startsAt }))
export const scheduleSchema = z.strictObject({
  patient: patientSchema, appointments: z.array(appointmentSchema), source: z.enum(["fixture", "neon"]),
})

// the server resolves patient ownership; clients supply a request ID and explicit confirmation
const confirmation = { requestId: requestIdSchema, confirmed: z.literal(true) }
export const bookingSchema = z.strictObject({ ...confirmation, slotId: slotIdSchema, notes: noteSchema.optional() })
export const cancellationSchema = z.strictObject(confirmation)
export const visitUpdateSchema = z.discriminatedUnion("action", [
  z.strictObject({ ...confirmation, action: z.literal("reschedule"), slotId: slotIdSchema, notes: noteSchema.optional() }),
  z.strictObject({ ...confirmation, action: z.literal("edit-notes"), notes: noteSchema }),
])
export const operationResultSchema = z.strictObject({ requestId: requestIdSchema, appointment: appointmentSchema })
export const errorCodeSchema = z.enum(["invalid_request", "not_found", "conflict", "database_unavailable", "provider_unavailable", "not_implemented", "forbidden", "unsupported_media_type", "payload_too_large"])
export const apiErrorSchema = z.strictObject({ code: errorCodeSchema, error: z.string() })

// model output can propose a draft, while confirmation belongs to the application
export const intentSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("clarify"), question: z.string().min(1).max(limits.message) }),
  z.strictObject({ kind: z.literal("search"), criteria: searchSchema }),
  z.strictObject({ kind: z.literal("book"), slotId: slotIdSchema }),
  z.strictObject({ kind: z.literal("cancel"), appointmentId: idSchema }),
  z.strictObject({ kind: z.literal("reschedule"), appointmentId: idSchema, slotId: slotIdSchema }),
  z.strictObject({ kind: z.literal("edit-notes"), appointmentId: idSchema }),
])
const messageSchema = z.string().trim().min(1).max(limits.message)
export const chatRequestSchema = z.strictObject({
  message: messageSchema,
  history: z.array(z.strictObject({ role: z.enum(["user", "assistant"]), text: messageSchema })).max(limits.historyTurns).optional(),
})
export const chatReplySchema = z.strictObject({ reply: z.string().min(1), intent: intentSchema.nullable() })

export type Patient = z.infer<typeof patientSchema>
export type Doctor = z.infer<typeof doctorSchema>
export type DoctorSearch = z.infer<typeof searchSchema>
export type Slot = z.infer<typeof slotSchema>
export type Appointment = z.infer<typeof appointmentSchema>
export type Schedule = z.infer<typeof scheduleSchema>
export type ChatReply = z.infer<typeof chatReplySchema>
export type ChatRequest = z.infer<typeof chatRequestSchema>
export type ApiError = z.infer<typeof apiErrorSchema>

// the provider acknowledges a synthetic operation; only storage commits the result
export interface SchedulingAdapter {
  searchProviders(criteria: DoctorSearch): Promise<Doctor[]>
  getAvailability(location: { doctorId: string; locationId: string }): Promise<Slot[]>
  bookAppointment(command: z.infer<typeof bookingSchema>): Promise<{ providerReference: string }>
  cancelAppointment(command: { appointmentId: string; requestId: string }): Promise<{ providerReference: string }>
  rescheduleAppointment(command: { appointmentId: string; requestId: string; slotId: string }): Promise<{ providerReference: string }>
}
