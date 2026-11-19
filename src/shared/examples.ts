import { bookingSchema, intentSchema, makeSlotId, searchSchema, visitUpdateSchema } from "./contracts"

// these examples are shared by the three worktrees and do not perform writes
export const exampleCriteria = searchSchema.parse({ query: "Primary care", zip: "94110" })
export const exampleSlotId = makeSlotId({ doctorId: "maya-chen", locationId: "mission", startsAt: "2030-04-16T10:30:00-07:00" })
export const exampleIntent = intentSchema.parse({ kind: "book", slotId: exampleSlotId })
const requestId = "33333333-3333-4333-8333-333333333333"
export const exampleBooking = bookingSchema.parse({ requestId, confirmed: true, slotId: exampleSlotId, notes: "" })
export const exampleNoteUpdate = visitUpdateSchema.parse({ requestId, confirmed: true, action: "edit-notes", notes: "Ask about scheduling." })
