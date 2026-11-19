import { SQL } from "bun"
import { demoPatient, demoAppointment } from "@/fixtures/demo"
import { migrateAppointments } from "./migrations/001-appointments"

// prefer the direct Neon endpoint for DDL and accept a standalone Postgres URL
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
if (!url) throw new Error("Set DATABASE_URL in .env before seeding.")
const database = new SQL({ url, max: 1 })

try {
  await database.begin(async tx => {
    // migrate first so existing edits survive repeated setup
    await migrateAppointments(tx)
    await tx`INSERT INTO inifinichat_demo.patients (id, name)
      VALUES (${demoPatient.id}, ${demoPatient.name}) ON CONFLICT (id) DO NOTHING`

    // keep one deterministic example for the first run
    const visit = demoAppointment
    await tx`INSERT INTO inifinichat_demo.appointments
      (id, patient_id, doctor, provider_id, location_id, slot_id, starts_at, time_zone, status, notes)
      VALUES (${visit.id}, ${demoPatient.id}, ${JSON.stringify(visit.doctor)}::text::jsonb, ${visit.doctor.id},
        ${visit.doctor.locationId}, ${visit.slotId}, ${visit.startsAt}, ${visit.doctor.timeZone}, ${visit.status}, ${visit.notes})
      ON CONFLICT (id) DO NOTHING`
  })
  console.log("Appointment migration and synthetic seed committed.")
} finally {
  await database.close()
}
