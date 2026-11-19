import { SQL } from "bun"
import { demoAppointment, demoPatient } from "@/fixtures/demo"
import { config } from "@/server/config"
import { patientSchema, type Appointment, type Patient, type Schedule } from "@/shared/contracts"
import { appointmentFromRow } from "./appointment"
export { changeAppointment, providerCall, resolveSlot, SchedulingError } from "./operations"

// reuse one small TCP pool for the long-lived Bun process
const database = config.DATABASE_URL ? new SQL({ url: config.DATABASE_URL, max: 4, connectionTimeout: 5 }) : undefined

/** Require durable storage before returning authoritative state. */
export function requireDatabase(): SQL {
  if (!database) {
    throw new Error("Database connection unavailable.")
  }
  return database
}

/** Reads the synthetic patient's schedule or the labeled offline preview. */
export async function readSchedule(): Promise<Schedule> {
  if (!database) {
    return { source: "fixture", patient: demoPatient, appointments: [demoAppointment] }
  }

  // return both parts from the same database snapshot
  return database.begin("READ ONLY, ISOLATION LEVEL REPEATABLE READ", async tx => ({
    patient: await readPatient(tx), appointments: await readAppointments(tx), source: "neon" as const,
  }))
}

/** Resolve the identity on the server for every patient-scoped query. */
export async function readPatient(db: SQL = requireDatabase()): Promise<Patient> {
  const [row] = await db`SELECT id, name FROM inifinichat_demo.patients WHERE id = ${demoPatient.id}`
  return patientSchema.parse(row)
}

/** Persist only the validated editable profile field. */
export async function updatePatient(name: string): Promise<Patient> {
  const db = requireDatabase()
  const [row] = await db`UPDATE inifinichat_demo.patients SET name = ${name}, updated_at = now()
    WHERE id = ${demoPatient.id} RETURNING id, name`
  return patientSchema.parse(row)
}

/** Return the patient's own appointments in a stable display order. */
export async function readAppointments(db: SQL = requireDatabase()): Promise<Appointment[]> {
  const rows = await db`SELECT * FROM inifinichat_demo.appointments WHERE patient_id = ${demoPatient.id}
    ORDER BY starts_at, id`
  return rows.map(appointmentFromRow)
}

/** Remove every occupied candidate, including slots booked by another owner. */
export async function availableSlots<T extends { id: string }>(slots: T[], db: SQL = requireDatabase()): Promise<T[]> {
  if (!slots.length) {
    return []
  }

  // compare canonical identities without exposing other patients' appointments
  const occupied = await db<{ slot_id: string }[]>`SELECT slot_id FROM inifinichat_demo.appointments WHERE status = 'confirmed'
    AND slot_id IN ${db(slots.map(slot => slot.id))}`
  const ids = new Set(occupied.map(row => row.slot_id))
  return slots.filter(slot => !ids.has(slot.id))
}
