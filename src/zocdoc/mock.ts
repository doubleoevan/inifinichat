import { doctors, slots } from "@/fixtures/demo"
import type { SchedulingAdapter } from "@/shared/contracts"

/**
 * Signals that the selected scheduling operation is still a scaffold.
 */
async function pendingAppointmentWrite(): Promise<never> {
  throw new Error("Appointment changes are not implemented yet.")
}

// keep searches and availability deterministic across demo runs
export const mockZocdoc: SchedulingAdapter = {
  async search({ query, location }) {
    // compare both supported search fields without changing display text
    const term = query.trim().toLowerCase()
    const place = location.trim().toLowerCase()
    return doctors.filter(doctor =>
      `${doctor.name} ${doctor.specialty}`.toLowerCase().includes(term)
      && doctor.location.toLowerCase().includes(place),
    )
  },
  async availability(doctorId) {
    return slots.filter(slot => slot.doctorId === doctorId)
  },
  book: pendingAppointmentWrite,
  cancel: pendingAppointmentWrite,
  reschedule: pendingAppointmentWrite,
}
