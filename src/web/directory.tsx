import { useEffect, useState } from "react"
import { Search } from "lucide-react"
import { limits, type Doctor, type DoctorSearch } from "@/shared/contracts"
import { Input } from "./components/ui/input"
import { getDoctors } from "./lib/api"
import type { DateWindow, Review } from "./lib/review"
import { SlotChoices } from "./slot-choices"

interface DirectoryProps {
  criteria?: DoctorSearch
  onReview: (draft: Review) => void
}

/** Searches doctors by name or specialty and filters available times in the clinic timezone. */
export function Directory({ criteria, onReview }: DirectoryProps) {
  const [search, setSearch] = useState(criteria)
  const [dates, setDates] = useState<DateWindow>({ from: "", through: "" })
  const [from, setFrom] = useState("")
  const [doctors, setDoctors] = useState<Doctor[]>()
  const [error, setError] = useState("")
  const [expanded, setExpanded] = useState("")

  // keep only results for the most recently submitted filters
  useEffect(() => {
    const controller = new AbortController()
    setError("")
    setDoctors(undefined)
    setExpanded("")
    const query = search ? new URLSearchParams({ q: search.query, zip: search.zip }) : new URLSearchParams()
    getDoctors(query, controller.signal).then(items => {
      if (!controller.signal.aborted) setDoctors(items)
    }).catch(() => { if (!controller.signal.aborted) setError("The directory could not be loaded. Search again to retry.") })
    return () => controller.abort()
  }, [search])

  return <>
    <h2>Find a doctor</h2>
    {/* search criteria and optional date window */}
    <form className="search-form panel" onSubmit={event => {
      event.preventDefault()
      const data = new FormData(event.currentTarget)
      setDates({ from, through: String(data.get("through") || "") })
      setSearch({ query: String(data.get("q") || "").trim(), zip: String(data.get("zip") || "") })
    }}>
      <label>Doctor or specialty<Input name="q" required pattern=".*\S.*" maxLength={limits.search} defaultValue={criteria?.query} placeholder="e.g. Primary care" /></label>
      <label>US ZIP<Input name="zip" required inputMode="numeric" pattern="[0-9]{5}" maxLength={5} defaultValue={criteria?.zip} placeholder="e.g. 94110" /></label>
      <label>From date <small>(optional)</small><Input type="date" name="from" value={from} onChange={event => setFrom(event.target.value)} /></label>
      <label>Through date <small>(optional)</small><Input type="date" name="through" min={from || undefined} /></label>
      <button className="primary" type="submit"><Search size={16} />Search</button>
      <small>Mock schedule · April 16–18, 2030</small>
    </form>
    {/* matching clinics and selectable appointments */}
    {error && <p role="alert">{error}</p>}
    {!error && !doctors && <p role="status">Searching…</p>}
    {doctors?.length === 0 && <p role="status">No doctors match this search.</p>}
    {doctors?.map(doctor => {
      const key = doctor.id + "/" + doctor.locationId
      return <article className="directory-row" key={key}>
        <span className="specialty">{doctor.specialty}</span><h3>{doctor.name}</h3>
        <p>{doctor.practice} · {doctor.location} {doctor.zip}</p>
        <button className="text-button" aria-expanded={expanded === key} onClick={() => setExpanded(expanded === key ? "" : key)}>
          {expanded === key ? "Hide times" : "View availability"}
        </button>
        {expanded === key && <SlotChoices doctor={doctor} dateWindow={dates} onSelect={slot => onReview({ kind: "book", doctor, slot })} />}
      </article>
    })}
  </>
}
