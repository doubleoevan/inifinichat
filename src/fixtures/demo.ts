import { makeSlotId, type Appointment, type Doctor, type Patient, type Slot } from "@/shared/contracts"

// synthetic patient shared by the offline preview and the database seed
export const demoPatient: Patient = { id: "demo-patient", name: "Avery Morgan" }

// fixed practice locations in the synthetic Bay Area directory
const mission = { locationId: "mission", zip: "94110", location: "San Francisco, CA", timeZone: "America/Los_Angeles" }
const eastBay = { locationId: "east-bay", zip: "94612", location: "Oakland, CA", timeZone: "America/Los_Angeles" }
const pacific = { locationId: "pacific", zip: "94115", location: "San Francisco, CA", timeZone: "America/Los_Angeles" }

// the two doctors named Chen share a ZIP and have different specialties
const maya: Doctor = { ...mission, id: "maya-chen", name: "Dr. Maya Chen", specialty: "Primary care", practice: "Mission Family Practice" }
const noah: Doctor = { ...eastBay, id: "noah-ellis", name: "Dr. Noah Ellis", specialty: "Dermatology", practice: "East Bay Dermatology" }
const leila: Doctor = { ...pacific, id: "leila-shah", name: "Dr. Leila Shah", specialty: "Cardiology", practice: "Pacific Heart Clinic" }
const mina: Doctor = { ...mission, id: "mina-chen", name: "Dr. Mina Chen", specialty: "Pediatrics", practice: "Mission Family Practice" }
export const doctors: Doctor[] = [maya, noah, leila, mina]

// fixed half-hour openings on April 16–18, 2030. Mina has no openings
export const slots: Slot[] = [
  fixtureSlot(maya, "2030-04-16T17:30:00Z"),
  fixtureSlot(noah, "2030-04-17T21:00:00Z"),
  fixtureSlot(leila, "2030-04-18T16:00:00Z"),
  fixtureSlot(maya, "2030-04-16T18:00:00Z"),
  fixtureSlot(maya, "2030-04-18T16:00:00Z"),
  fixtureSlot(noah, "2030-04-18T21:00:00Z"),
  fixtureSlot(leila, "2030-04-18T22:00:00Z"),
]

// the seeded appointment remains readable outside the directory's fixture dates
const seededSlot = fixtureSlot(maya, "2030-04-10T16:30:00Z")
export const demoAppointment: Appointment = {
  id: "demo-visit", doctor: maya, startsAt: seededSlot.startsAt, slotId: seededSlot.id,
  status: "confirmed", notes: "",
}

/**
 * Derives a slot's identity from its provider, location and fixed start.
 */
function fixtureSlot(doctor: Doctor, startsAt: string): Slot {
  const identity = { doctorId: doctor.id, locationId: doctor.locationId, startsAt }
  return { ...identity, id: makeSlotId(identity), timeZone: doctor.timeZone }
}
