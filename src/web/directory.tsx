import { useEffect, useState } from "react"
import { Search } from "lucide-react"
import type { Doctor, Slot } from "@/shared/contracts"
import { Input } from "./components/ui/input"
import { formatVisitTime, readJson } from "./lib/api"

/**
 * Searches the mock doctor directory and opens a doctor's available times.
 */
export function Directory() {
  const [filters, setFilters] = useState("")
  const [doctors, setDoctors] = useState<Doctor[]>()
  const [error, setError] = useState("")

  // cancel stale searches when the patient submits a different filter
  useEffect(() => {
    const controller = new AbortController()
    setError("")
    setDoctors(undefined)
    readJson<Doctor[]>(`/api/doctors?${filters}`, { signal: controller.signal }).then(setDoctors)
      .catch((failure: Error) => { if (!controller.signal.aborted) setError(failure.message) })
    return () => controller.abort()
  }, [filters])

  return (
    <>
      <h2>Doctor directory</h2>
      {/* search by name or specialty and location */}
      <form className="search-form" onSubmit={event => {
        event.preventDefault()
        const fields = new FormData(event.currentTarget)
        setFilters(new URLSearchParams({ q: String(fields.get("q") || ""), location: String(fields.get("location") || "") }).toString())
      }}>
        <label>Doctor or specialty<Input name="q" placeholder="e.g. Primary care" /></label>
        <label>Location<Input name="location" placeholder="City or state" /></label>
        <button className="primary" type="submit"><Search size={16} />Search</button>
      </form>
      {/* results */}
      {error && <p role="alert">{error}</p>}
      {!error && !doctors && <p role="status">Searching…</p>}
      {doctors?.length === 0 && <p>No doctors match this search.</p>}
      {doctors?.map(doctor => <DoctorListing key={doctor.id} doctor={doctor} />)}
    </>
  )
}

function DoctorListing({ doctor }: { doctor: Doctor }) {
  const [slots, setSlots] = useState<Slot[]>()
  const [error, setError] = useState("")

  async function handleAvailability(): Promise<void> {
    // read the mock provider's slots on demand
    try {
      setError("")
      setSlots(await readJson<Slot[]>(`/api/doctors/${doctor.id}/availability`))
    } catch { setError("Available times could not be loaded.") }
  }

  return (
    <article className="directory-row">
      <span className="specialty">{doctor.specialty}</span><h3>{doctor.name}</h3>
      <p>{doctor.practice} · {doctor.location}</p>
      <button onClick={handleAvailability} className="text-button">View availability</button>
      <div role="status">{error}{slots?.length === 0 && "No openings."}{slots?.map(slot => <p key={slot.id}>{formatVisitTime(slot.startsAt)}</p>)}</div>
    </article>
  )
}
