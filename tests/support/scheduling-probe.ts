import { createSchedulingRoutes } from "@/server/http"
import { doctors } from "@/fixtures/demo"
import { makeSlotId, type SchedulingAdapter, type Slot } from "@/shared/contracts"

// give each live test its own provider namespace to avoid occupying demo slots
const doctor = { ...doctors[0], id: process.argv[2] }
const slots: Slot[] = [1, 2, 3, 4].map(hour => {
  const startsAt = `2030-04-16T0${hour}:00:00.000Z`
  const identity = { doctorId: doctor.id, locationId: doctor.locationId, startsAt }
  return { ...identity, id: makeSlotId(identity), timeZone: doctor.timeZone }
})

// this injected adapter simulates a failed provider acknowledgement on one replacement
const adapter: SchedulingAdapter = {
  searchProviders: async () => [doctor],
  getAvailability: async () => slots,
  async bookAppointment(command) {
    if ("notes" in command) {
      throw new Error("Private notes reached provider.")
    }
    return { providerReference: command.requestId }
  },
  async cancelAppointment(command) { return { providerReference: command.requestId } },
  async rescheduleAppointment(command) {
    if (command.slotId === slots[3].id) {
      throw new Error("Injected provider error.")
    }
    return { providerReference: command.requestId }
  },
}

// each restart opens a new Bun process and database pool
const routes = createSchedulingRoutes({ adapter, listDoctors: () => [doctor] })
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, routes })
console.log(server.url.href)
