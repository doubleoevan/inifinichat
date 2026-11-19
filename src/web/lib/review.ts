import { bookingSchema, cancellationSchema, appointmentUpdateSchema, type Appointment, type Doctor, type Slot } from "@/shared/contracts"

// confirmed writes are built from a patient-selected appointment or available slot
export type AppointmentReviewDraft =
  | { kind: "book"; doctor: Doctor; slot: Slot }
  | { kind: "cancel" | "edit-notes"; appointment: Appointment }
  | { kind: "reschedule"; appointment: Appointment; slot: Slot }

export interface DateWindow { from: string; through: string }

/** Compares dates in the clinic's calendar, including slots close to UTC midnight. */
export function inDateWindow(slot: Slot, window: DateWindow): boolean {
  const date = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: slot.timeZone,
  }).format(new Date(slot.startsAt))
  return (!window.from || date >= window.from) && (!window.through || date <= window.through)
}

/** Constructs a validated command only after the patient confirms the review. */
export function confirmedCommand(input: { draft: AppointmentReviewDraft; requestId: string; notes: string }) {
  const { draft, requestId, notes } = input
  const confirmation = { requestId, confirmed: true as const }

  // review the selected provider slot for a new appointment
  if (draft.kind === "book") {
    return {
      url: "/api/appointments", method: "POST" as const,
      body: bookingSchema.parse({ ...confirmation, slotId: draft.slot.id, notes }),
    }
  }

  // update the selected patient's appointment by its server-issued ID
  const url = `/api/appointments/${encodeURIComponent(draft.appointment.id)}`
  if (draft.kind === "cancel") {
    return {
      url: url + "/cancel", method: "POST" as const, body: cancellationSchema.parse(confirmation),
    }
  }
  const edit = draft.kind === "reschedule" ? { action: draft.kind, slotId: draft.slot.id, notes } : { action: draft.kind, notes }
  return { url, method: "PATCH" as const, body: appointmentUpdateSchema.parse({ ...confirmation, ...edit }) }
}
