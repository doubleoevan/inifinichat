import { makeSlotId } from "@/shared/contracts"
import type { Appointment, Doctor, Patient, Slot } from "@/shared/contracts"

// synthetic records shared by the offline demo, database seed and tests
export const demoPatient: Patient = { id: "demo-patient", name: "Avery Morgan" }

export const doctors: Doctor[] = [
  { id: "maya-chen", locationId: "mission", zip: "94110", timeZone: "America/Los_Angeles", name: "Dr. Maya Chen", specialty: "Primary care", practice: "Mission Family Practice", location: "San Francisco, CA" },
  { id: "noah-ellis", locationId: "east-bay", zip: "94612", timeZone: "America/Los_Angeles", name: "Dr. Noah Ellis", specialty: "Dermatology", practice: "East Bay Dermatology", location: "Oakland, CA" },
  { id: "leila-shah", locationId: "pacific", zip: "94115", timeZone: "America/Los_Angeles", name: "Dr. Leila Shah", specialty: "Cardiology", practice: "Pacific Heart Clinic", location: "San Francisco, CA" },
]

export const slots: Slot[] = doctors.map((doctor, index) => {
  // use absolute fixture instants and stable provider location IDs
  const startsAt = ["2030-04-16T17:30:00Z", "2030-04-17T21:00:00Z", "2030-04-18T16:00:00Z"][index]
  const identity = { doctorId: doctor.id, locationId: doctor.locationId, startsAt }
  return { ...identity, id: makeSlotId(identity), timeZone: doctor.timeZone }
})

const firstVisit = { doctorId: doctors[0].id, locationId: doctors[0].locationId, startsAt: "2030-04-10T16:30:00Z" }
export const demoAppointment: Appointment = {
  id: "demo-visit", doctor: doctors[0], startsAt: firstVisit.startsAt, slotId: makeSlotId(firstVisit),
  status: "confirmed", notes: "",
}
