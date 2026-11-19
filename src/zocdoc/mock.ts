import { doctors, slots } from "@/fixtures/demo"
import {
  bookingSchema, idSchema, limits, requestIdSchema, searchSchema, slotIdSchema,
  type Doctor, type SchedulingAdapter,
} from "@/shared/contracts"

// test controls are supplied when constructing an adapter
type ProviderFailure = { operation: keyof SchedulingAdapter; code: "conflict" | "provider_unavailable" }
type MockOptions = { now?: () => number; failure?: ProviderFailure }
type ProviderCode = "invalid_request" | "not_found" | ProviderFailure["code"]

// the application uses the ordinary fixture schedule and system clock
export const mockZocdoc = createMockZocdoc()

/**
 * Creates an in-process scheduling adapter backed by fixed directory fixtures.
 */
export function createMockZocdoc({ now = Date.now, failure }: MockOptions = {}): SchedulingAdapter {
  return {
    async searchProviders(criteria) {
      // validate and search both supported fields within the selected ZIP
      const result = searchSchema.safeParse(criteria)
      if (!result.success) throw providerError("invalid_request", "Enter a doctor name or specialty and a five-digit ZIP.")
      simulateFailure(failure, "searchProviders")
      const term = result.data.query.toLowerCase()
      const matches = doctors.filter(doctor => doctor.zip === result.data.zip
        && (doctor.name.toLowerCase().includes(term) || doctor.specialty.toLowerCase().includes(term)))
      return matches.slice(0, limits.candidates).map(doctor => ({ ...doctor }))
    },
    async getAvailability({ doctorId, locationId }) {
      // distinguish an unknown provider location from one with no openings
      if (!idSchema.safeParse(doctorId).success || !idSchema.safeParse(locationId).success) {
        throw providerError("invalid_request", "Invalid provider or location ID.")
      }
      if (!doctors.some(doctor => doctor.id === doctorId && doctor.locationId === locationId)) {
        throw providerError("not_found", "Unknown provider location.")
      }

      // return future openings in chronological fixture order
      simulateFailure(failure, "getAvailability")
      const cutoff = now()
      const matches = slots.filter(slot => slot.doctorId === doctorId && slot.locationId === locationId && Date.parse(slot.startsAt) > cutoff)
      return matches.slice(0, limits.candidates).map(slot => ({ ...slot }))
    },
    async bookAppointment(command) {
      // validate the confirmed command and its selected fixture slot
      if (!bookingSchema.safeParse(command).success) throw providerError("invalid_request", "Invalid booking command.")
      requireBookableSlot(command.slotId, now())
      simulateFailure(failure, "bookAppointment")
      return { providerReference: `mock-book-${command.requestId}` }
    },
    async cancelAppointment(command) {
      // validate the identifiers supplied by the scheduling service
      validateAppointmentCommand(command)
      simulateFailure(failure, "cancelAppointment")
      return { providerReference: `mock-cancel-${command.requestId}` }
    },
    async rescheduleAppointment(command) {
      // validate the target slot before acknowledging the change
      validateAppointmentCommand(command)
      requireBookableSlot(command.slotId, now())
      simulateFailure(failure, "rescheduleAppointment")
      return { providerReference: `mock-reschedule-${command.requestId}` }
    },
  }
}

/**
 * Returns the synthetic directory for the unfiltered opening view.
 */
export function listDemoDoctors(): Doctor[] {
  return doctors.map(doctor => ({ ...doctor }))
}

/**
 * Verifies that the selected slot exists and can still be booked.
 */
function requireBookableSlot(slotId: string, cutoff: number): void {
  // distinguish malformed, unknown and expired selections
  if (!slotIdSchema.safeParse(slotId).success) throw providerError("invalid_request", "Invalid slot ID.")
  const slot = slots.find(candidate => candidate.id === slotId)
  if (!slot) throw providerError("not_found", "Unknown mock slot.")
  if (Date.parse(slot.startsAt) <= cutoff) throw providerError("conflict", "This mock slot has already started.")
}

/**
 * Checks the appointment and request identifiers before acknowledging a write.
 */
function validateAppointmentCommand(command: { appointmentId: string; requestId: string }): void {
  if (!idSchema.safeParse(command.appointmentId).success || !requestIdSchema.safeParse(command.requestId).success) {
    throw providerError("invalid_request", "Invalid appointment or request ID.")
  }
}

/**
 * Applies a deterministic failure to the operation named by a test.
 */
function simulateFailure(failure: ProviderFailure | undefined, operation: keyof SchedulingAdapter): void {
  if (failure?.operation === operation) throw providerError(failure.code, "Simulated mock provider failure.")
}

/**
 * Pairs a safe message with the scheduling API's error code.
 */
function providerError(code: ProviderCode, message: string): Error & { code: ProviderCode } {
  return Object.assign(new Error(message), { code })
}
