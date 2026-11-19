import { useRef, useState } from "react"
import { patientSchema, profileUpdateSchema, type Patient } from "@/shared/contracts"
import { Input } from "./components/ui/input"
import { sendJson } from "./lib/api"

interface ProfileProps { patient: Patient; onSave: (patient: Patient) => void }

/** Edits the server-selected demo patient. */
export function Profile({ patient, onSave }: ProfileProps) {
  const [name, setName] = useState(patient.name)
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)

  async function handleSave(): Promise<void> {
    // validate the editable field before sending it to the profile route
    const input = profileUpdateSchema.safeParse({ name })
    if (pending.current || !input.success) return
    pending.current = true
    setBusy(true)
    setNotice("")
    try {
      const saved = patientSchema.parse(await sendJson({ url: "/api/patient", method: "PATCH", body: input.data }))
      if (saved.id !== patient.id) throw new Error("The profile could not be verified.")
      onSave(saved)
      setName(saved.name)
      setNotice("Profile saved.")
    } catch (failure) {
      setNotice(failure instanceof Error ? failure.message : "The profile could not be saved.")
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return <>
    <h2>Patient profile</h2>
    <form className="panel profile" onSubmit={event => { event.preventDefault(); void handleSave() }}>
      {/* patient name and save status */}
      <label htmlFor="patient-name">Name</label>
      <Input id="patient-name" autoComplete="name" maxLength={100} required value={name} disabled={busy} onChange={event => { setName(event.target.value); setNotice("") }} />
      <div className="action-row"><button type="submit" className="primary" disabled={busy || !name.trim() || name.trim() === patient.name}>{busy ? "Saving…" : "Save profile"}</button>
        <span role="status">{notice}</span></div>
    </form>
  </>
}
