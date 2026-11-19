import type { Appointment, Doctor, Patient, Slot } from "@/shared/contracts"

// synthetic records shared by the offline demo, database seed and tests
export const demoPatient: Patient = { id: "demo-patient", name: "Avery Morgan" }

export const doctors: Doctor[] = [
  { id: "maya-chen", name: "Dr. Maya Chen", specialty: "Primary care", practice: "Mission Family Practice", location: "San Francisco, CA" },
  { id: "noah-ellis", name: "Dr. Noah Ellis", specialty: "Dermatology", practice: "East Bay Dermatology", location: "Oakland, CA" },
  { id: "leila-shah", name: "Dr. Leila Shah", specialty: "Cardiology", practice: "Pacific Heart Clinic", location: "San Francisco, CA" },
]

export const slots: Slot[] = [
  { id: "chen-am", doctorId: "maya-chen", startsAt: "2030-04-16T17:30:00Z" },
  { id: "ellis-pm", doctorId: "noah-ellis", startsAt: "2030-04-17T21:00:00Z" },
  { id: "shah-am", doctorId: "leila-shah", startsAt: "2030-04-18T16:00:00Z" },
]

export const demoAppointment: Appointment = {
  id: "demo-visit", doctor: doctors[0], startsAt: "2030-04-10T16:30:00Z", status: "booked",
}
