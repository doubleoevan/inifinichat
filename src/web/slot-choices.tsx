import { useEffect, useState } from "react"
import type { Doctor, Slot } from "@/shared/contracts"
import { formatSlotTime, getSlots } from "./lib/api"
import { inDateWindow, type DateWindow } from "./lib/review"

interface SlotChoicesProps {
  doctor: Doctor
  dateWindow?: DateWindow
  excludeId?: string
  onSelect: (slot: Slot) => void
}

/** Lists selectable times supplied by the clinic availability route. */
export function SlotChoices({ doctor, dateWindow, excludeId, onSelect }: SlotChoicesProps) {
  const [slots, setSlots] = useState<Slot[]>()
  const [error, setError] = useState("")
  const [attempt, setAttempt] = useState(0)

  // discard old responses when the clinic changes
  useEffect(() => {
    const controller = new AbortController()
    setSlots(undefined)
    setError("")
    getSlots(doctor, controller.signal).then(items => {
      if (!controller.signal.aborted) {
        setSlots(items)
      }
    }).catch(() => {
      if (!controller.signal.aborted) {
        setError("Available times could not be loaded.")
      }
    })
    return () => controller.abort()
  }, [doctor.id, doctor.locationId, attempt])

  // display the provider-local date and timezone for every candidate
  if (error) {
    return <div role="alert">{error} <button className="text-button" onClick={() => setAttempt(attempt + 1)}>Retry times</button></div>
  }
  if (!slots) {
    return <p role="status">Loading times…</p>
  }
  const available = slots.filter(slot => slot.id !== excludeId && (!dateWindow || inDateWindow(slot, dateWindow)))
  if (!available.length) {
    return <p role="status">No openings in this window.</p>
  }
  return <div className="slot-list" aria-label={`Available times for ${doctor.name}`}>
    {available.map(slot => <button className="secondary" key={slot.id} onClick={() => onSelect(slot)}>{formatSlotTime(slot)}</button>)}
  </div>
}
