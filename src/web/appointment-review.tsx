import { useEffect, useRef, useState } from "react"
import { limits, operationResultSchema, type Appointment, type Patient } from "@/shared/contracts"
import { Textarea } from "./components/ui/textarea"
import { formatVisitTime, sendJson } from "./lib/api"
import { confirmedCommand, type Review } from "./lib/review"

interface ReviewProps {
  draft: Review
  patient: Patient
  onClose: () => void
  onCommitted: (visit: Appointment) => void
  onRefresh: () => Promise<unknown>
}

const titles = { book: "Review booking", cancel: "Cancel appointment?", reschedule: "Review new time", "edit-notes": "Edit local notes" }
const actions = { book: "Confirm booking", cancel: "Confirm cancellation", reschedule: "Confirm reschedule", "edit-notes": "Save local notes" }

/** Collects explicit confirmation for the exact action shown to the patient. */
export function AppointmentReview({ draft, patient, onClose, onCommitted, onRefresh }: ReviewProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const pending = useRef(false)
  const lastAttempt = useRef<{ notes: string; id: string } | null>(null)
  const [notes, setNotes] = useState(draft.kind === "book" ? "" : draft.visit.notes)
  const [busy, setBusy] = useState(false)
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [error, setError] = useState("")

  // let the native modal handle keyboard focus and background interaction
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  async function handleRefresh(): Promise<void> {
    // enable retries only after reading current appointment state
    setNeedsRefresh(true)
    try {
      await onRefresh()
      setNeedsRefresh(false)
    } catch {
      setError("The current schedule could not be verified. Refresh appointments before retrying.")
    }
  }

  async function handleConfirm(): Promise<void> {
    if (pending.current || needsRefresh) return

    // retain one ID across retries of the same patient-confirmed payload
    pending.current = true
    setBusy(true)
    setError("")
    if (lastAttempt.current?.notes !== notes) lastAttempt.current = { notes, id: crypto.randomUUID() }
    const requestId = lastAttempt.current.id
    try {
      const command = confirmedCommand({ draft, notes, requestId })
      const result = operationResultSchema.parse(await sendJson(command))
      if (result.requestId !== requestId || (draft.kind !== "book" && result.appointment.id !== draft.visit.id)) {
        throw new Error("The server could not confirm this change.")
      }
      onCommitted(result.appointment)
    } catch (failure) {
      // a lost HTTP response can arrive after the database commits
      setError(failure instanceof Error ? failure.message : "The change could not be confirmed.")
      await handleRefresh()
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  // show the selected slot or the appointment's current confirmed time
  const doctor = draft.kind === "book" ? draft.doctor : draft.visit.doctor
  const when = "slot" in draft ? draft.slot : { startsAt: draft.visit.startsAt, timeZone: doctor.timeZone }
  return <dialog ref={dialog} className="panel review" aria-labelledby="review-heading" onCancel={event => { event.preventDefault(); if (!pending.current) onClose() }}>
    <form onSubmit={event => { event.preventDefault(); void handleConfirm() }}>
      {/* appointment and patient confirmation details */}
      <h2 id="review-heading">{titles[draft.kind]}</h2>
      <dl className="review-details">
        <dt>Patient</dt><dd>{patient.name}</dd>
        <dt>Doctor</dt><dd>{doctor.name}</dd>
        <dt>Clinic</dt><dd>{doctor.practice} · {doctor.location} {doctor.zip}</dd>
        {draft.kind === "reschedule" && <><dt>Current time</dt><dd>{formatVisitTime({ startsAt: draft.visit.startsAt, timeZone: doctor.timeZone })}</dd></>}
        <dt>{draft.kind === "reschedule" ? "New time" : "Time"}</dt><dd>{formatVisitTime(when)}</dd>
      </dl>
      {/* local note and explicit approval */}
      {draft.kind !== "cancel" && <div className="note">
        <label htmlFor="review-notes">Local notes</label>
        <Textarea id="review-notes" rows={3} maxLength={limits.note} value={notes} disabled={busy || needsRefresh} onChange={event => setNotes(event.target.value)} />
        <small>{notes.length}/{limits.note} characters · Saved with this appointment.</small>
      </div>}
      {error && <p role="alert">{error}</p>}
      <div className="action-row">
        {needsRefresh ? <button key="refresh" className="primary" type="button" disabled={busy} onClick={handleRefresh}>Refresh appointments</button> :
          <button key="confirm" className="primary" type="submit" disabled={busy}>{busy ? "Saving…" : actions[draft.kind]}</button>}
        <button className="secondary" type="button" disabled={busy} onClick={onClose}>Back</button>
      </div>
    </form>
  </dialog>
}
