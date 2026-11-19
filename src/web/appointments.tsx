import { Textarea } from "./components/ui/textarea"
import { useState } from "react"
import { Clock3, MapPin } from "lucide-react"
import { limits, type Appointment, type Schedule } from "@/shared/contracts"
import { formatVisitTime, readJson } from "./lib/api"

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
          <p className="detail"><Clock3 size={16} />{formatVisitTime({ startsAt: visit.startsAt, timeZone: visit.doctor.timeZone })}</p>
          <p className="detail"><MapPin size={16} />{visit.doctor.practice} · {visit.doctor.location}</p>
          {/* appointment note draft */}
          <VisitNote key={schedule.patient.id + visit.id} visit={visit} />
        </article>
      ))}
    </>
  )
}

function VisitNote({ visit }: { visit: Appointment }) {
  const key = `note-${visit.id}`
  const [note, setNote] = useState(visit.notes)
  const [notice, setNotice] = useState("")

  async function handleSave(): Promise<void> {
    // preserve the draft until the database confirms a write
    try {
      await readJson(`/api/appointments/${visit.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "edit-notes", notes: note, confirmed: true, requestId: crypto.randomUUID() }),
      })
      setNotice("Saved.")
    } catch (failure) {
      setNotice(failure instanceof Error ? failure.message : "The note could not be saved.")
    }
  }

  return (
    <div className="note">
      <label htmlFor={key}>Local notes</label>
      <Textarea id={key} rows={2} maxLength={limits.note} value={note} onChange={event => { setNote(event.target.value); setNotice("") }} placeholder="Add a note for this visit…" />
      <div className="flex items-center gap-3"><button className="secondary" onClick={handleSave}>Save note</button><small role="status">{notice || "Demo preview · 100 characters max."}</small></div>
    </div>
  )
}
