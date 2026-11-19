import { SQL } from "bun"
import { demoAppointment, demoPatient } from "@/fixtures/demo"
import type { Appointment, Patient, Schedule } from "@/shared/contracts"

// reuse one small TCP pool across requests to the long-lived Bun process
const database = process.env.DATABASE_URL ? new SQL({ url: process.env.DATABASE_URL, max: 4 }) : undefined

/**
 * Reads the synthetic patient's schedule from Neon or the offline fixture.
 */
export async function readSchedule(): Promise<Schedule> {
  if (!database) return { source: "fixture", patient: demoPatient, appointments: [demoAppointment] }

  // require a seeded demo patient before listing that patient's appointments
  const [patient] = await database<Patient[]>`SELECT id, name FROM inifinichat_demo.patients WHERE id = ${demoPatient.id}`
  if (!patient) throw new Error("The demo patient has not been seeded.")

  // return the provider snapshot saved with each appointment
  const appointments = await database<Appointment[]>`
    SELECT id, doctor, to_char(starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "startsAt", status
    FROM inifinichat_demo.appointments WHERE patient_id = ${patient.id} ORDER BY starts_at, id
  `
  return { source: "neon", patient, appointments }
}
