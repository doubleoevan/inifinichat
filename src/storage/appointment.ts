import { appointmentSchema, type Appointment } from "@/shared/contracts"

/** Reconstruct the canonical public snapshot from Postgres values. */
export function appointmentFromRow(row: { id: string; doctor: unknown; slot_id: string; starts_at: Date; status: string; notes: string }): Appointment {
  return appointmentSchema.parse({
    id: row.id, doctor: row.doctor, slotId: row.slot_id, startsAt: row.starts_at.toISOString(),
    status: row.status, notes: row.notes,
  })
}
