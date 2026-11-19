import type { SQL } from "bun"
import { doctors } from "@/fixtures/demo"
import { doctorSchema, makeSlotId } from "@/shared/contracts"

/** Upgrade the original two-table seed in a single transaction. */
export async function migrateAppointments(tx: SQL): Promise<void> {
  // serialize migrations from separate app checkouts
  await tx`SELECT pg_advisory_xact_lock(hashtext('inifinichat_demo.migration'))`
  await tx`CREATE SCHEMA IF NOT EXISTS inifinichat_demo`
  await tx`CREATE TABLE IF NOT EXISTS inifinichat_demo.patients (
    id text PRIMARY KEY, name text NOT NULL
  )`
  await tx`CREATE TABLE IF NOT EXISTS inifinichat_demo.appointments (
    id text PRIMARY KEY, patient_id text NOT NULL REFERENCES inifinichat_demo.patients(id),
    doctor jsonb NOT NULL, starts_at timestamptz NOT NULL, status text NOT NULL
  )`

  // the slot column and all accompanying changes commit together
  const [installed] = await tx`SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'inifinichat_demo' AND table_name = 'appointments' AND column_name = 'slot_id'`
  if (installed) return

  // retain original appointment IDs, times and provider display text
  await tx`ALTER TABLE inifinichat_demo.patients
    ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now()`
  await tx`ALTER TABLE inifinichat_demo.appointments
    DROP CONSTRAINT IF EXISTS appointments_status_check,
    ADD COLUMN provider_id text, ADD COLUMN location_id text, ADD COLUMN slot_id text, ADD COLUMN time_zone text,
    ADD COLUMN notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 100),
    ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now()`
  const original = await tx`SELECT id, doctor, starts_at FROM inifinichat_demo.appointments`
  for (const row of original) {
    const fixture = doctors.find(doctor => doctor.id === row.doctor.id)
    const doctor = doctorSchema.parse({ ...fixture, ...row.doctor })
    const slotId = makeSlotId({ doctorId: doctor.id, locationId: doctor.locationId, startsAt: row.starts_at.toISOString() })
    await tx`UPDATE inifinichat_demo.appointments SET
      doctor = ${JSON.stringify(doctor)}::text::jsonb, provider_id = ${doctor.id}, location_id = ${doctor.locationId},
      time_zone = ${doctor.timeZone}, slot_id = ${slotId},
      status = CASE status WHEN 'booked' THEN 'confirmed' WHEN 'cancelled' THEN 'canceled' ELSE status END
      WHERE id = ${row.id}`
  }

  // enforce patient ownership, active-slot exclusivity and replay identity in Postgres
  await tx`ALTER TABLE inifinichat_demo.appointments
    ALTER COLUMN provider_id SET NOT NULL, ALTER COLUMN location_id SET NOT NULL,
    ALTER COLUMN slot_id SET NOT NULL, ALTER COLUMN time_zone SET NOT NULL,
    ADD CONSTRAINT appointments_status_check CHECK (status IN ('confirmed', 'canceled'))`
  await tx`CREATE INDEX appointments_patient_time ON inifinichat_demo.appointments (patient_id, starts_at)`
  await tx`CREATE UNIQUE INDEX appointments_confirmed_slot ON inifinichat_demo.appointments (slot_id) WHERE status = 'confirmed'`
  await tx`CREATE TABLE inifinichat_demo.appointment_operations (
    patient_id text NOT NULL REFERENCES inifinichat_demo.patients(id), request_id uuid NOT NULL,
    payload_hash text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (patient_id, request_id)
  )`
}
