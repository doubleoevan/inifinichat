import { doctors, slots } from "@/fixtures/demo"
import { limits, type Doctor, type SchedulingAdapter } from "@/shared/contracts"

/**
 * Signals that the selected scheduling operation is still a scaffold.
 */
async function pendingAppointmentWrite(): Promise<never> {
  throw new Error("Appointment changes are not implemented yet.")
}

// keep searches and availability deterministic across demo runs
export const mockZocdoc: SchedulingAdapter = {
  async searchProviders({ query, zip }) {
    // compare both supported search fields without changing display text
    const term = query.trim().toLowerCase()
    return doctors.filter(doctor =>
      `${doctor.name} ${doctor.specialty}`.toLowerCase().includes(term)
      && doctor.zip === zip,
    ).slice(0, limits.candidates)
  },
  async getAvailability({ doctorId, locationId }) {
    return slots.filter(slot => slot.doctorId === doctorId && slot.locationId === locationId)
  },
  bookAppointment: pendingAppointmentWrite,
  cancelAppointment: pendingAppointmentWrite,
  rescheduleAppointment: pendingAppointmentWrite,
}

/**
 * Returns the synthetic directory for the unfiltered opening view.
 */
export function listDemoDoctors(): Doctor[] {
  return [...doctors]
}
