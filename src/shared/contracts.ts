// public scheduling data shared by the browser, API and adapters
export interface Patient {
  id: string
  name: string
}

export interface Doctor {
  id: string
  name: string
  specialty: string
  practice: string
  location: string
}

export interface Slot {
  id: string
  doctorId: string
  startsAt: string
}

export interface Appointment {
  id: string
  doctor: Doctor
  startsAt: string
  status: "booked" | "cancelled"
}

export interface Schedule {
  patient: Patient
  appointments: Appointment[]
  source: "fixture" | "neon"
}

// search accepts a doctor name or specialty and an optional location
export interface DoctorSearch {
  query: string
  location: string
}

// appointment writes remain a separate workflow from local patient notes
export interface SchedulingAdapter {
  search(filters: DoctorSearch): Promise<Doctor[]>
  availability(doctorId: string): Promise<Slot[]>
  book(request: { patientId: string; slotId: string }): Promise<Appointment>
  cancel(request: { patientId: string; appointmentId: string }): Promise<void>
  reschedule(request: { patientId: string; appointmentId: string; slotId: string }): Promise<Appointment>
}

export interface ChatReply {
  reply: string
}
