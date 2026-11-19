import type { ModelDraft } from "@/conversation/openai"
import { chatReplySchema, searchSchema, slotIdSchema, type Appointment, type ChatReply } from "@/shared/contracts"

interface DraftContext {
  appointments: () => Promise<Appointment[]>
  available: (slotId: string) => Promise<boolean>
}

/** Return server-authored text and a validated draft without changing any data. */
export async function resolveDraft(draft: ModelDraft, context: DraftContext): Promise<ChatReply> {
  // directory searches need no database or appointment disclosure
  if (draft.kind === "clarify") {
    return clarify("Would you like to find a doctor or manage an appointment?")
  }
  if (draft.kind === "search") {
    const criteria = searchSchema.safeParse({ query: draft.query, zip: draft.zip })
    if (!criteria.success) {
      return clarify("Which doctor name or specialty and five-digit US ZIP should I search?")
    }
    return reply("Choose a doctor from the search results.", { kind: "search", criteria: criteria.data })
  }

  // match bookable slots against both the provider and committed bookings
  if (draft.kind === "book") {
    const slot = slotIdSchema.safeParse(draft.slotId)
    if (!slot.success || !await context.available(slot.data)) {
      return clarify("Which available time would you like to book? Select a slot from the directory.")
    }
    return reply("Review this slot and confirm if you want to book it.", { kind: "book", slotId: slot.data })
  }

  // resolve an unspecified appointment only when the patient's selection is unambiguous
  const appointments = (await context.appointments()).filter(appointment => draft.kind === "edit-notes" || appointment.status === "confirmed")
  const appointment = draft.appointmentId === null
    ? (appointments.length === 1 ? appointments[0] : undefined)
    : appointments.find(candidate => candidate.id === draft.appointmentId)
  if (!appointment) {
    return clarify("Which of your appointments would you like to change? Select it from your appointments.")
  }

  if (draft.kind === "cancel") {
    return reply("Review this appointment before confirming cancellation.", { kind: "cancel", appointmentId: appointment.id })
  }
  if (draft.kind === "edit-notes") {
    return reply("Review your local notes and confirm any edits.", { kind: "edit-notes", appointmentId: appointment.id })
  }

  // a replacement belongs to the same doctor and location and has to be free
  const slot = slotIdSchema.safeParse(draft.slotId)
  if (slot.success && slot.data.startsWith(`${appointment.doctor.id}/${appointment.doctor.locationId}/`) && await context.available(slot.data)) {
    return reply("Review the replacement time before confirming.", { kind: "reschedule", appointmentId: appointment.id, slotId: slot.data })
  }
  return clarify("Select an available replacement time with the same doctor and location.")
}

function reply(message: string, intent: ChatReply["intent"]): ChatReply {
  return chatReplySchema.parse({ reply: message, intent })
}

function clarify(question: string): ChatReply {
  return reply(question, { kind: "clarify", question })
}
