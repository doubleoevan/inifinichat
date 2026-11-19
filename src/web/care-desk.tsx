import { useEffect, useState } from "react"
import { CalendarDays, CircleUserRound, PanelsTopLeft, Stethoscope } from "lucide-react"
import type { Schedule } from "@/shared/contracts"
import { Appointments } from "./appointments"
import { Directory } from "./directory"
import { Assistant } from "./assistant"
import { readJson } from "./lib/api"

/**
 * Displays the patient's visits, directory and scheduling assistant.
 */
export function CareDesk() {
  const [schedule, setSchedule] = useState<Schedule>()
  const [error, setError] = useState("")
  const [view, setView] = useState<"visits" | "directory">("visits")

  // load the synthetic patient snapshot once per page visit
  useEffect(() => {
    const controller = new AbortController()
    readJson<Schedule>("/api/schedule", { signal: controller.signal }).then(setSchedule)
      .catch((failure: Error) => { if (!controller.signal.aborted) setError(failure.message) })
    return () => controller.abort()
  }, [])

  return (
    <>
      {/* project identity and patient context */}
      <header className="masthead"><div className="frame flex items-center justify-between gap-4">
        <div className="brand"><PanelsTopLeft size={24} aria-hidden="true" />Inifinichat</div>
        <span className="patient"><CircleUserRound size={18} aria-hidden="true" />{schedule?.patient.name || "Demo patient"} · Mock appointments</span>
      </div></header>
      <main className="frame">
        {/* workspace title and navigation */}
        <h1>Care desk</h1>
        <nav aria-label="Care desk views" className="tabs">
          <button aria-pressed={view === "visits"} onClick={() => setView("visits")}><CalendarDays size={17} />Appointments</button>
          <button aria-pressed={view === "directory"} onClick={() => setView("directory")}><Stethoscope size={17} />Find a doctor</button>
        </nav>
        {/* appointments or directory alongside chat */}
        <div className="workspace">
          <section>{view === "directory" ? <Directory /> : <Appointments schedule={schedule} error={error} />}</section>
          <Assistant />
        </div>
      </main>
    </>
  )
}
