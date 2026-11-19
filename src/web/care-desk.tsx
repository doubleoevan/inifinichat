import { useEffect, useRef, useState, type ReactNode } from "react"
import { CalendarDays, CircleUserRound, PanelsTopLeft, Stethoscope } from "lucide-react"
import { scheduleSchema, type Appointment, type ChatReply, type DoctorSearch, type Schedule } from "@/shared/contracts"
import { Appointments } from "./appointments"
import { AppointmentReview } from "./appointment-review"
import { Assistant } from "./assistant"
import { Directory } from "./directory"
import { Profile } from "./profile"
import { getDoctors, getSlots, readJson } from "./lib/api"
import type { AppointmentReviewDraft } from "./lib/review"

type DeskView = "appointments" | "directory" | "profile" | "evals"

/** Coordinates the one-patient workspace, assistant selections and confirmed server results. */
export function CareDesk({ evals }: { evals?: ReactNode }) {
  const [schedule, setSchedule] = useState<Schedule>()
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [view, setView] = useState<DeskView>("appointments")
  const [openedEvals, setOpenedEvals] = useState(false)
  const [draft, setDraft] = useState<AppointmentReviewDraft | null>(null)
  const [search, setSearch] = useState<{ criteria?: DoctorSearch; version: number }>({ version: 0 })
  const generation = useRef(0)

  async function refresh(signal?: AbortSignal): Promise<Schedule> {
    // preserve the newest read or committed result if a request finishes late
    const current = ++generation.current
    try {
      const next = scheduleSchema.parse(await readJson("/api/schedule", { signal }))
      if (!signal?.aborted && current === generation.current) { setSchedule(next); setError("") }
      return next
    } catch (failure) {
      if (!signal?.aborted && current === generation.current) setError("Your schedule could not be loaded.")
      throw failure
    }
  }

  // read the durable schedule again on every page load
  useEffect(() => {
    const controller = new AbortController()
    void refresh(controller.signal).catch(() => {})
    return () => controller.abort()
  }, [])

  async function handleIntent(intent: NonNullable<ChatReply["intent"]>, signal: AbortSignal): Promise<void> {
    // apply search criteria through the ordinary directory form
    if (intent.kind === "clarify") return
    if (intent.kind === "search") {
      setSearch(previous => ({ criteria: intent.criteria, version: previous.version + 1 }))
      setView("directory")
      return
    }

    // resolve proposed IDs against fresh records before opening an action review
    const current = await refresh(signal)
    signal.throwIfAborted()
    if (intent.kind === "book") {
      const [doctorId, locationId] = intent.slotId.split("/")
      const doctors = await getDoctors(new URLSearchParams(), signal)
      const doctor = doctors.find(item => item.id === doctorId && item.locationId === locationId)
      if (!doctor) throw new Error("Unknown clinic.")
      const slot = (await getSlots(doctor, signal)).find(item => item.id === intent.slotId)
      if (!slot) throw new Error("Unavailable time.")
      signal.throwIfAborted()
      setDraft({ kind: "book", doctor, slot })
      return
    }

    // find the patient's active appointment and validate any replacement time
    const appointment = current.appointments.find(item => item.id === intent.appointmentId && (intent.kind === "edit-notes" || item.status === "confirmed"))
    if (!appointment) throw new Error("Unknown appointment.")
    if (intent.kind === "reschedule") {
      const slot = (await getSlots(appointment.doctor, signal)).find(item => item.id === intent.slotId && item.id !== appointment.slotId)
      if (!slot) throw new Error("Unavailable time.")
      signal.throwIfAborted()
      setDraft({ kind: "reschedule", slot, appointment })
    } else setDraft({ kind: intent.kind, appointment })
  }

  function handleCommitted(appointment: Appointment): void {
    // render only the snapshot acknowledged by the server
    generation.current++
    setSchedule(previous => previous && ({
      ...previous, appointments: [...previous.appointments.filter(item => item.id !== appointment.id), appointment]
        .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)),
    }))
    setError("")
    setDraft(null)
    setNotice("Appointment updated.")
    setView("appointments")
  }

  function handleReview(next: AppointmentReviewDraft): void {
    setNotice("")
    if (!schedule || error) {
      setView("appointments")
      return
    }
    setDraft(next)
  }

  return <>
    {/* application identity and synthetic patient context */}
    <header className="masthead"><div className="frame flex items-center justify-between gap-4">
      <div className="brand"><PanelsTopLeft size={24} aria-hidden="true" />Inifinichat</div>
      <span className="patient"><CircleUserRound size={18} aria-hidden="true" />{schedule?.patient.name || "Demo patient"} · Mock appointments</span>
    </div></header>
    <main className="frame">
      {/* workspace navigation */}
      <h1>Care desk</h1>
      <nav aria-label="Care desk views" className="tabs">
        <button aria-pressed={view === "appointments"} onClick={() => setView("appointments")}><CalendarDays size={17} />Appointments</button>
        <button aria-pressed={view === "directory"} onClick={() => setView("directory")}><Stethoscope size={17} />Find a doctor</button>
        <button aria-pressed={view === "profile"} onClick={() => setView("profile")}><CircleUserRound size={17} />Profile</button>
        {evals && <button aria-pressed={view === "evals"} onClick={() => { setOpenedEvals(true); setView("evals") }}>Evals</button>}
      </nav>
      {/* patient data and scheduling assistant */}
      <div className="workspace">
        <section>
          {schedule?.source === "fixture" && <p className="feedback">Offline fixture preview · Connect the database to save changes.</p>}
          {notice && <p role="status" className="feedback">{notice}</p>}
          {error && <div role="alert">{error} <button className="text-button" onClick={() => void refresh().catch(() => {})}>Refresh schedule</button></div>}
          {openedEvals && <div hidden={view !== "evals"}>{evals}</div>}
          {view === "evals" ? null : view === "directory" ? <Directory key={search.version} criteria={search.criteria} onReview={handleReview} /> :
            !schedule ? (!error && <p role="status">Loading schedule…</p>) :
            view === "appointments" ? <Appointments appointments={schedule.appointments} onReview={handleReview} /> :
            <Profile patient={schedule.patient} onSave={patient => {
              generation.current++
              setSchedule(previous => previous && ({ ...previous, patient }))
            }} />}
        </section>
        <Assistant onIntent={handleIntent} />
      </div>
    </main>
    {schedule && draft && <AppointmentReview draft={draft} patient={schedule.patient} onClose={() => setDraft(null)}
      onCommitted={handleCommitted} onRefresh={() => refresh()} />}
  </>
}
