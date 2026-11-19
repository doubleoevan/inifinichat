/**
 * Reads a JSON response and reports the API's public error message.
 */
export async function readJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || "The request could not be completed.")
  }
  return response.json()
}

/**
 * Formats the appointment in the clinic's local time zone.
 */
export function formatVisitTime(startsAt: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    timeZone: "America/Los_Angeles", timeZoneName: "short",
  }).format(new Date(startsAt))
}
