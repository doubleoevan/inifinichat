import { useState } from "react"
import { Clock3, MapPin } from "lucide-react"
import type { Appointment } from "@/shared/contracts"
import { formatSlotTime } from "./lib/api"
import type { AppointmentReviewDraft } from "./lib/review"
import { SlotChoices } from "./slot-choices"

interface AppointmentsProps {
  appointments: Appointment[]
  onReview: (draft: AppointmentReviewDraft) => void
}

/** Displays committed appointments and opens a review before a patient changes one. */
export function Appointments({ appointments, onReview }: AppointmentsProps) {
  const [choosing, setChoosing] = useState("")
  return <>
    <h2>Your appointments</h2>
    {appointments.length === 0 && <p>No appointments scheduled.</p>}
    {appointments.map(appointment => <article className="appointment panel" key={appointment.id}>
      {/* committed appointment details */}
      <div className="flex items-center justify-between gap-2"><span className="specialty">{appointment.doctor.specialty}</span><span className="status">{appointment.status}</span></div>
      <h3>{appointment.doctor.name}</h3>
      <p className="detail"><Clock3 size={16} />{formatSlotTime({ startsAt: appointment.startsAt, timeZone: appointment.doctor.timeZone })}</p>
      <p className="detail"><MapPin size={16} />{appointment.doctor.practice} · {appointment.doctor.location} {appointment.doctor.zip}</p>
      <div className="note"><h4>Local notes</h4><p>{appointment.notes || "No notes added."}</p></div>
      {/* patient-selected actions on an active appointment */}
      <div className="action-row">
        <button className="secondary" onClick={() => onReview({ kind: "edit-notes", appointment })}>Edit notes</button>
        {appointment.status === "confirmed" && <><button className="secondary" aria-expanded={choosing === appointment.id} onClick={() => setChoosing(choosing === appointment.id ? "" : appointment.id)}>Reschedule</button>
        <button className="text-button" onClick={() => onReview({ kind: "cancel", appointment })}>Cancel appointment</button></>}
      </div>
      {choosing === appointment.id && appointment.status === "confirmed" && <div className="replacement">
        <h4>Choose a new time</h4>
        <SlotChoices doctor={appointment.doctor} excludeId={appointment.slotId} onSelect={slot => {
          setChoosing("")
          onReview({ kind: "reschedule", appointment, slot })
        }} />
      </div>}
    </article>)}
  </>
}
