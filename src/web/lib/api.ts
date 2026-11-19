import { doctorSchema, limits, slotSchema, type Doctor, type Slot } from "@/shared/contracts"

/** Reads a same-origin JSON response under a finite deadline. */
export async function readJson(url: string, options: RequestInit = {}): Promise<unknown> {
  // let callers cancel requests independently of the network deadline
  const timeout = AbortSignal.timeout(limits.timeoutMs + 5000)
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
  const response = await fetch(url, { ...options, signal, cache: "no-store" })
  const body = await response.json().catch(() => null)

  // expose only the API's public error text
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "The request could not be completed.")
  return body
}

/** Sends a confirmed form or chat submission to its application route. */
export function sendJson(options: { url: string; method: "POST" | "PATCH"; body: unknown; signal?: AbortSignal }): Promise<unknown> {
  return readJson(options.url, {
    method: options.method, headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options.body), signal: options.signal,
  })
}

/** Looks up providers through the mock directory. */
export async function getDoctors(query: URLSearchParams, signal?: AbortSignal): Promise<Doctor[]> {
  return doctorSchema.array().parse(await readJson(`/api/doctors?${query}`, { signal }))
}

/** Loads the clinic's currently bookable slots. */
export async function getSlots(doctor: Doctor, signal?: AbortSignal): Promise<Slot[]> {
  const params = new URLSearchParams({ locationId: doctor.locationId })
  const values = await readJson(`/api/doctors/${encodeURIComponent(doctor.id)}/availability?${params}`, { signal })
  return slotSchema.array().parse(values).filter(slot => slot.doctorId === doctor.id && slot.locationId === doctor.locationId)
}

/** Formats the appointment in the clinic's local time zone. */
export function formatVisitTime({ startsAt, timeZone }: { startsAt: string; timeZone: string }): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    timeZone, timeZoneName: "short",
  }).format(new Date(startsAt))
}
