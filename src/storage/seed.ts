import { SQL } from "bun"
import { demoPatient, demoAppointment } from "@/fixtures/demo"

// use the direct Neon connection for transactional DDL
const url = process.env.DATABASE_URL_UNPOOLED
if (!url) throw new Error("Set DATABASE_URL_UNPOOLED in .env before seeding.")
const database = new SQL({ url, max: 1 })

try {
  await database.begin(async transaction => {
    // isolate demo data from other tables on the same branch
    await transaction`CREATE SCHEMA IF NOT EXISTS inifinichat_demo`
    await transaction`CREATE TABLE IF NOT EXISTS inifinichat_demo.patients (
      id text PRIMARY KEY, name text NOT NULL
    )`
    await transaction`CREATE TABLE IF NOT EXISTS inifinichat_demo.appointments (
      id text PRIMARY KEY, patient_id text NOT NULL REFERENCES inifinichat_demo.patients(id),
      doctor jsonb NOT NULL, starts_at timestamptz NOT NULL,
      status text NOT NULL CHECK (status IN ('booked', 'cancelled'))
    )`

    // preserve existing appointments when the seed runs again
    await transaction`INSERT INTO inifinichat_demo.patients (id, name)
      VALUES (${demoPatient.id}, ${demoPatient.name}) ON CONFLICT (id) DO NOTHING`
    await transaction`INSERT INTO inifinichat_demo.appointments (id, patient_id, doctor, starts_at, status)
      VALUES (${demoAppointment.id}, ${demoPatient.id}, ${JSON.stringify(demoAppointment.doctor)}::text::jsonb,
              ${demoAppointment.startsAt}, 'booked') ON CONFLICT (id) DO NOTHING`
  })
  console.log("Demo schema and seed committed.")
} finally {
  await database.close()
}
