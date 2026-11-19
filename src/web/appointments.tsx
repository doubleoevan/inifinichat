import { useState } from "react"
import { Clock3, MapPin } from "lucide-react"
import type { Appointment, Schedule } from "@/shared/contracts"
import { formatVisitTime } from "./lib/api"

/**
 * Shows appointment details and notes for the synthetic patient.
 */
export function Appointments({ schedule, error }: { schedule?: Schedule; error: string }) {
  if (error) return <p role="alert">{error}</p>
  if (!schedule) return <p role="status">Loading appointments…</p>
  return (
    <>
      <h2>Your appointments</h2>
      {schedule.appointments.length === 0 && <p>No appointments scheduled.</p>}
      {schedule.appointments.map(visit => (
        <article className="visit panel" key={visit.id}>
          {/* visit identity */}
          <div className="flex items-center justify-between gap-2"><span className="specialty">{visit.doctor.specialty}</span><span className="status">{visit.status}</span></div>
          <h3>{visit.doctor.name}</h3>
          <p className="detail"><Clock3 size={16} />{formatVisitTime(visit.startsAt)}</p>
          <p className="detail"><MapPin size={16} />{visit.doctor.practice} · {visit.doctor.location}</p>
          {/* browser-local notes */}
          <VisitNote key={schedule.patient.id + visit.id} patientId={schedule.patient.id} visit={visit} />
        </article>
      ))}
    </>
  )
}

function VisitNote({ patientId, visit }: { patientId: string; visit: Appointment }) {
  const key = `inifinichat.note.${patientId}.${visit.id}`
  const [note, setNote] = useState(() => {
    try { return localStorage.getItem(key) || "" } catch { return "" }
  })
  const [notice, setNotice] = useState("")

  function handleSave(): void {
    // keep editable notes on this browser, including an explicitly cleared note
    try {
      localStorage.setItem(key, note)
      setNotice("Saved on this device.")
    } catch {
      setNotice("This browser could not save the note.")
    }
  }

  return (
    <div className="note">
      <label htmlFor={key}>Visit note</label>
      <textarea id={key} rows={2} maxLength={1500} value={note} onChange={event => { setNote(event.target.value); setNotice("") }} placeholder="Add a note for this visit…" />
      <div className="flex items-center gap-3"><button className="secondary" onClick={handleSave}>Save note</button><small role="status">{notice || "Stored on this device."}</small></div>
    </div>
  )
}
