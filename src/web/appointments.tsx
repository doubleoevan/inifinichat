import { useState } from "react"
import { Clock3, MapPin } from "lucide-react"
import type { Appointment } from "@/shared/contracts"
import { formatVisitTime } from "./lib/api"
import type { Review } from "./lib/review"
import { SlotChoices } from "./slot-choices"

interface AppointmentsProps {
  visits: Appointment[]
  onReview: (draft: Review) => void
}

/** Displays committed visits and opens a review before a patient changes one. */
export function Appointments({ visits, onReview }: AppointmentsProps) {
  const [choosing, setChoosing] = useState("")
  return <>
    <h2>Your appointments</h2>
    {visits.length === 0 && <p>No appointments scheduled.</p>}
    {visits.map(visit => <article className="visit panel" key={visit.id}>
      {/* committed appointment details */}
      <div className="flex items-center justify-between gap-2"><span className="specialty">{visit.doctor.specialty}</span><span className="status">{visit.status}</span></div>
      <h3>{visit.doctor.name}</h3>
      <p className="detail"><Clock3 size={16} />{formatVisitTime({ startsAt: visit.startsAt, timeZone: visit.doctor.timeZone })}</p>
      <p className="detail"><MapPin size={16} />{visit.doctor.practice} · {visit.doctor.location} {visit.doctor.zip}</p>
      <div className="note"><h4>Local notes</h4><p>{visit.notes || "No notes added."}</p></div>
      {/* patient-selected actions on an active visit */}
      <div className="action-row">
        <button className="secondary" onClick={() => onReview({ kind: "edit-notes", visit })}>Edit notes</button>
        {visit.status === "confirmed" && <><button className="secondary" aria-expanded={choosing === visit.id} onClick={() => setChoosing(choosing === visit.id ? "" : visit.id)}>Reschedule</button>
        <button className="text-button" onClick={() => onReview({ kind: "cancel", visit })}>Cancel appointment</button></>}
      </div>
      {choosing === visit.id && visit.status === "confirmed" && <div className="replacement">
        <h4>Choose a new time</h4>
        <SlotChoices doctor={visit.doctor} excludeId={visit.slotId} onSelect={slot => {
          setChoosing("")
          onReview({ kind: "reschedule", visit, slot })
        }} />
      </div>}
    </article>)}
  </>
}
