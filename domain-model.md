# Domain model

Use **appointment** for the patient’s saved record, **slot** for a doctor’s time at a location, and **booking** for the action that creates an appointment. A patient can call an appointment a “visit” in chat. The API, database, and scheduling code use appointment.

## Scheduling

| Term | Meaning and identifiers |
| --- | --- |
| Patient | The server selects one synthetic `Patient`. Its profile has an `id` and editable `name`. The database associates each appointment with its owner through `patient_id`. |
| Doctor | A `Doctor` describes a clinician at a practice location. Search accepts a name or specialty and a five-digit ZIP. The UI and HTTP API use **doctor**. The adapter method `searchProviders` and database column `provider_id` use **provider** for the same clinician. |
| Practice and location | `practice` names the practice. `location` is its display text. `locationId` identifies the site and `timeZone` supplies its IANA time zone. Use the site’s local date for calendar filters. |
| Slot | A `Slot` has a `doctorId`, `locationId`, and absolute `startsAt`. Together they form its stable `id`, with the instant normalized to UTC. An appointment refers to that value as `slotId`. |
| Availability | The adapter returns future candidate slots for one doctor and location. Storage removes slots occupied by confirmed appointments. The remaining slots are available to book. |
| Doctor directory | `DoctorDirectory` groups `listDoctors` with the `SchedulingAdapter` used by the server and storage. The in-process Zocdoc adapter searches fixtures, supplies candidate slots, and acknowledges commands with a `providerReference`. |
| Appointment | Booking creates an `Appointment` with its own `id`, a doctor snapshot, a slot, local notes, and status `confirmed`. Rescheduling changes its slot and keeps its appointment ID. Cancellation sets `canceled` and releases the slot. |
| Local notes | The appointment’s `notes` field holds up to 100 characters in Postgres. The patient can edit notes on confirmed and canceled appointments. Rescheduling can save a new time and notes together. |
| Schedule | A `Schedule` contains the patient, their appointments, and a `source`. The API uses `fixture` for the offline preview and `neon` for its database-backed response. The eval report identifies which database ran each case. |

The [shared scheduling contracts](src/shared/contracts.ts) define the public fields. [Appointment transactions](src/storage/operations.ts) and [availability filtering](src/storage/schedule.ts) define what commits and when a slot becomes available.

## From chat to a saved appointment

| Term | Meaning and identifiers |
| --- | --- |
| Model draft | `ModelDraft` is the model’s proposed action or search. Its references can be incomplete. The server resolves them against the directory and the patient’s appointments. |
| Intent | The validated `ChatReply.intent` can clarify, search, book, cancel, reschedule, or edit notes. The UI uses it to show results or open an appointment review. |
| Appointment review draft | `AppointmentReviewDraft` holds the specific appointment or slot the patient is reviewing. Both the scheduling forms and chat can open the same confirmation dialog. |
| Appointment command | Explicit confirmation produces a command with `confirmed: true` and a UUID `requestId`. Booking, cancellation, rescheduling, and note edits each use their corresponding request schema. |
| Operation result | A successful write returns `{requestId, appointment}`. The service saves the result and a payload hash in `appointment_operations`. Repeating the same request returns its saved result. Reusing the ID with different content returns a conflict. |

Trace a change from the [model draft](src/conversation/openai.ts) through [intent resolution](src/server/chat.ts) and [command construction](src/web/lib/review.ts).

## Evaluation

| Term | Meaning and identifiers |
| --- | --- |
| Eval case | One scheduling scenario with a stable case `id`, input, and expected behavior. Its `EvalResult` records observations, execution mode, stage timings, and automated status (`passed`, `failed`, or `skipped`). |
| Eval report | An `EvalReport` groups case results under a single `runId`. A case ID identifies the scenario across runs. The run ID identifies one execution. |
| Eval review | An `EvalReview` is the human reviewer’s label and notes for a case in that run. Labels are `Unreviewed`, `Pass`, `Fail`, and `Unsure`. The JSON export includes this judgment alongside the automated result. |

See the [report schema](src/shared/evaluation.ts) and the [review and export UI](src/web/evals.tsx).

## Compatibility

The seeded appointment ID is `demo-visit`. Existing databases and fixtures use that literal. The public TypeScript export `visitUpdateSchema` remains an alias for `appointmentUpdateSchema`. The [database migration](src/storage/migrations/001-appointments.ts) maps historical status values `booked` and `cancelled` to `confirmed` and `canceled`.
