import { SQL } from "bun"
import { demoAppointment, demoPatient, doctors } from "@/fixtures/demo"
import { config } from "@/server/config"
import { appointmentSchema, makeSlotId, type Doctor, type Patient, type Schedule } from "@/shared/contracts"

// reuse one small TCP pool across requests to the long-lived Bun process
const database = config.DATABASE_URL ? new SQL({ url: config.DATABASE_URL, max: 4 }) : undefined

/**
 * Reads the synthetic patient's schedule from Neon or the offline fixture.
 */
export async function readSchedule(): Promise<Schedule> {
  if (!database) return { source: "fixture", patient: demoPatient, appointments: [demoAppointment] }

  // require a seeded demo patient before listing that patient's appointments
  const [patient] = await database<Patient[]>`SELECT id, name FROM inifinichat_demo.patients WHERE id = ${demoPatient.id}`
  if (!patient) throw new Error("The demo patient has not been seeded.")

  // return the provider snapshot saved with each appointment
  const rows = await database<{ id: string; doctor: Partial<Doctor>; startsAt: string; status: string }[]>`
    SELECT id, doctor, to_char(starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "startsAt", status
    FROM inifinichat_demo.appointments WHERE patient_id = ${patient.id} ORDER BY starts_at, id
  `
  // enrich the original seed snapshot with the fixed provider location
  const appointments = rows.map(row => {
    const provider = doctors.find(doctor => doctor.id === row.doctor.id)
    if (!provider) throw new Error("Unrecognized synthetic provider.")
    const slotId = makeSlotId({ doctorId: provider.id, locationId: provider.locationId, startsAt: row.startsAt })
    return appointmentSchema.parse({ ...row, doctor: { ...provider, ...row.doctor }, slotId, notes: "",
      status: row.status === "booked" ? "confirmed" : "canceled" })
  })
  return { source: "neon", patient, appointments }
}
