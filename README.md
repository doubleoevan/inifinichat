# Inifinichat

Inifinichat is a local appointment desk for one synthetic patient. One Bun process serves a React interface and a JSON API on the loopback address. Search the synthetic directory, select an available slot, and confirm a booking. The desk lets you change the visit time, edit local notes, or cancel. Chat suggests actions for you to review.

## Run locally

Use Bun 1.4.3 and Git. The module checker supports Node.js 22, 24, and 26 or later. Final verification used Node.js 26.12.1. From the project root, run the following commands.

```sh
bun install --frozen-lockfile
test -f .env || cp .env.local .env
bun run hooks:install
```

For the full demo, set two active assignments in the ignored `.env`: `OPENAI_API_KEY` for chat and `DATABASE_URL` for the Neon connection string. Keep the public `.env.local` as three commented examples. Then migrate, seed, and start the app from the same folder.

```sh
bun run db:seed
bun run dev
```

Open **http://127.0.0.1:3000**. Set `PORT` to choose a different port. The dev command builds the browser bundle and watches the server. After editing the browser code, run `bun run build:ui` and refresh.

For an offline preview, skip the seed and run `bun run dev` with an empty `DATABASE_URL`. The desk opens a labeled fixture schedule and mock directory. Booking and verified availability require Neon. The forms work without an OpenAI key. `OPENAI_MODEL` defaults to `gpt-4.1-mini`. Each chat submission makes one bounded server-side call.

## Demo walkthrough

1. Open **Find a doctor**. Search for **Chen** in **94110**. Maya and Mina appear. Select **View availability** for Maya and choose a Pacific-time slot.
2. Enter a local note and choose **Confirm booking**. Refresh **Appointments** to see the saved visit. Restarting Bun with the same database also preserves the visit and keeps the slot occupied.
3. Select **Reschedule**, choose another time at the same clinic, edit the note, and confirm. If someone has since taken the replacement slot, the original time and note remain together.
4. Select **Cancel appointment** and confirm. Reopen the clinic’s availability to see the released slot. **Clear chat** clears only the conversation.
5. In **Evals**, expand a case, compare the expected and observed state, and export any human labels you enter. Generate a report first with `bun run evals` on a fresh checkout.

## Neon Postgres

The declared service in `neon.ts` is Postgres. This checkout was linked to project `bitter-haze-00979726`, branch `production` (`br-solitary-glade-ar54ytjo`). A new checkout needs its own ignored `.neon` link. With the Neon CLI installed and signed in, run:

```sh
neon init -y --org-id org-odd-credit-10225180 --project-id bitter-haze-00979726 --branch production --services postgres
neon deploy
bun run db:seed
bun run dev
```

Bun's SQL client reuses the pooled `DATABASE_URL` for app traffic. The migration and seed run together with `bun run db:seed`. For setup, the seed prefers `DATABASE_URL_UNPOOLED` when Neon supplies it and otherwise uses `DATABASE_URL`. It upgrades the original scaffold in place and inserts missing records in `inifinichat_demo`. Repeated seeds preserve existing edits. A configured but unavailable database produces a service error.

## Check and build

```sh
bun run typecheck
bun run boundaries
bun test
npm run build
bun run start
```

Run the Neon integration tests after seeding. They use the configured database and remove their temporary records when finished.

```sh
RUN_NEON_TESTS=1 bun --env-file=.env test tests/scheduling-neon.test.ts
```

Final verification ran from a clean copy. The production build, TypeScript check, and dependency check passed. All 21 regression tests passed with the Neon tests enabled. The default offline test command skips the two live database tests.

Chrome booked a synthetic slot against Neon, edited its note, reloaded the page, and restarted Bun. The visit persisted and its slot stayed occupied. A conflicting reschedule preserved both the original time and note. Canceling released the slot. A live OpenAI cancellation draft and **Clear chat** both left the patient and schedule intact. Verification removed both temporary bookings. A separate disposable PostgreSQL check reran the seed twice and preserved edits to the seeded profile and visit.

The hook validates the staged environment reference and rejects a tracked real environment file. It then runs the same offline dependency-cruiser policy before each commit. Stage all relevant source and checker inputs first. It checks that the worktree matches the index for those inputs. Build artifacts are in `dist/`. Start the built app from the project root.

## Run and review scheduling evals

Install PostgreSQL server tools (`initdb` and `pg_ctl` on your PATH) and Google Chrome. On macOS, Homebrew's `postgresql@16` works. To use a different installed Chromium binary, set `EVAL_CHROME` to its executable path. Install the locked Bun dependencies from **Run locally** first.

```sh
bun run evals
bun run dev
```

The default runs eight scenarios against the actual app with a fixed April 2030 clock, a deterministic model, the in-process mock directory, and a disposable, password-protected PostgreSQL cluster on loopback. It requires no API credentials and removes the cluster after the run. The persistence case opens a real browser, reloads the page and restarts the Bun process. The two live checks appear as skipped unless explicitly selected.

| Scenario | What to inspect |
| --- | --- |
| Specialty and ZIP | The proposed criteria, matching primary care doctor, slot identities and clinic timezone |
| Similar names | Both Chen candidates in 94110 and the empty result in Oakland |
| Missing details | Clarification for a missing ZIP, no openings and clinic-local date filtering |
| Booking | Confirmation required, 100-character note limit, identical replay and conflicting reuse of a request ID |
| Rescheduling | Occupied replacement restores the original time and note; a valid replacement and local edit persist |
| Cancellation | Repeated cancellation and return of the released slot |
| Persistence | Browser refresh, process restart, duplicate-slot rejection and an unavailable database |
| Untrusted text and ownership | Foreign appointment access, delimiter collisions and escaped note and provider text |

To add the two live checks, use the ignored `.env` and run:

```sh
bun run evals --neon --openai
```

The verified run completed all eight offline scenarios and both live checks. The review controls and JSON download also passed a browser check with a separate synthetic review. To repeat that browser check, run `bun evals/review-check.ts` after building the UI.

Either flag works independently. The Neon probe uses temporary synthetic records and cleans them up. The OpenAI case makes one scheduling interpretation request with retries disabled. All directory and provider operations remain mocked. Timings measure elapsed stages and HTTP round trips.

Open **Evals**, expand a scenario, and compare its input, expected behavior, actual response and observed state. Each result starts **Unreviewed** even if the automated checks passed. Select **Pass**, **Fail** or **Unsure**, add evidence in **Reviewer notes**, and click **Export JSON**. You can switch tabs without losing a review. Refreshing the page clears labels and notes. The CLI atomically replaces the local `.evals/latest.json` report after each run; the browser only reads it. [Case-author and reviewer prompts](evals/AGENTS.md)

### Timing observations

Run `bun evals/timings.ts` to print five scenarios from the existing `.evals/latest.json`, including every recorded stage, outcome and error. To read an exported run, pass its JSON path. Human labels are optional for this command.

These samples come from run `6e7ab359-a007-400d-b5ec-5ce35fe7669c` on November 19, 2026. Each total covers the whole scenario. All five passed with no case errors. All five used mock Zocdoc.

| Scenario | Model and storage | Total (ms) | Selected observations (ms) |
| --- | --- | ---: | --- |
| Specialty and ZIP | Fixture model, local Postgres | 24.1 | Chat 4.6, directory 4.3, availability 10.6, second directory lookup 0.4 |
| Confirm and replay a booking | Fixture mode, local Postgres | 13.7 | Initial booking 4.7, replay 1.8, changed-payload rejection 1.4. The case expected two HTTP 400s and one 409. |
| Refresh, restart and outages | Fixture mode, local Postgres | 1,953.0 | Browser reload and Bun restart together 1,881.7. The database-outage probe took 55.4 and returned the expected 503. |
| Live Neon persistence | No model, real Neon | 8,587.5 | The two HTTP and persistence probes together took 8,587.1, including process restart and cleanup. |
| Live OpenAI interpretation | Real OpenAI, no database | 1,454.9 | Chat HTTP round trip 1,346.9, then mock directory lookup 6.5. |

The restart case explicitly relaunched Bun. The OpenAI probe started a fresh local app process. Provider and database cache warmth were unrecorded. Each scenario has one observation in this sample.

## Modules and request flow

| Module | Paths and public entry points |
| --- | --- |
| Browser | `src/web/care-desk.tsx` hosts visits, profile, directory, chat and evals. `src/web/lib/api.ts` calls the same-origin API using DTOs from `src/shared/contracts.ts`. |
| HTTP | `src/server/server.ts` starts the loopback process. `startApp` in `src/server/app.ts` mounts assets and `createSchedulingRoutes` from `src/server/http.ts`. The handlers validate input and select the demo patient. |
| Directory | `createMockZocdoc` in `src/zocdoc/mock.ts` uses deterministic providers and slots from `src/fixtures/demo.ts`. Storage filters occupied slots before the browser sees availability. |
| Persistence | `src/storage/schedule.ts` exposes `readSchedule` and `changeAppointment`. The transaction in `src/storage/operations.ts` takes an injected provider interface and commits the result in Neon. `src/storage/seed.ts` runs the versioned migration. |
| Conversation | `interpretChat` in `src/conversation/openai.ts` returns a structured draft. `resolveDraft` in `src/server/chat.ts` checks references and returns a selection for the browser to review. |
| Evaluation | `evals/run.ts` writes local observations. `GET /api/evals` serves the latest report. `src/web/evals.tsx` holds reviewer choices in page memory until export. |

For a booking, React sends the selected slot and request ID to Bun after confirmation. The service validates the mock provider’s response and commits the appointment and replay result together. The UI displays the committed snapshot. For chat, the server returns a draft through a separate route. Selecting a draft opens the same confirmation flow.

## HTTP contract

Success responses use the DTOs in `src/shared/contracts.ts`. Errors use `{ code, error }`. Runtime schemas reject unknown command fields. See [validated examples](src/shared/examples.ts).

| Request | Input and result |
| --- | --- |
| `GET /api/health`, `GET /api/status` | Process health and mock mode, or OpenAI configuration status |
| `GET /api/schedule` | Current synthetic patient, appointments and source (`neon` or offline `fixture`) |
| `GET /api/patient`, `PATCH /api/patient` | Profile, or `{name}` to update it |
| `GET /api/doctors?q=chen&zip=94110` | Match a doctor name or specialty and US ZIP. Omit both parameters to browse the fixed directory. |
| `GET /api/doctors/maya-chen/availability?locationId=mission` | Candidate slots for a provider location |
| `GET /api/appointments`, `POST /api/appointments` | Appointment list, or a confirmed booking command with a slot ID and optional notes |
| `POST /api/appointments/:id/cancel` | Confirmed cancellation command |
| `PATCH /api/appointments/:id` | Confirmed `edit-notes` or `reschedule` command. Rescheduling takes a replacement slot and optional notes. |
| `POST /api/chat` | `{message, history?}` → `{reply, intent}`. The server validates the model's suggestion. The UI resolves the selected doctor, slot, or appointment and opens it for review. |
| `GET /api/evals` | Latest local eval report, or HTTP 404 until the first run |

Appointment commands require a UUID `requestId` and `confirmed: true` from the UI. The server selects the patient. A committed mutation will return `{requestId, appointment}`. Repeating the same request ID and payload returns the original result. Reusing the ID with different content returns a conflict. The desk shows a completed appointment change after Neon commits it.

Slot IDs use `providerId/locationId/UTC-instant`, for example `maya-chen/mission/2030-04-16T17:30:00.000Z`. The location carries its IANA timezone. The directory’s From and Through filters use each clinic’s local date. The synthetic directory offers 30-minute openings on April 16–18, 2030, in Pacific time. Search for **Chen** in **94110** to see two providers. Maya has three candidate slots and Mina has none. Occupied and past slots are excluded from availability. `ZOCDOC_MODE` defaults to `mock` and rejects other values.

## Limits and state

The HTTP body limit is 8 KiB. A chat request accepts 1,500 characters per message and at most six history entries. The server makes one OpenAI call with a 20-second timeout and a 250-token output cap. Provider records, visit notes and contact data stay out of the current model prompt. The model has no tools or authority to confirm a write. The browser renders text through React.

Search terms allow 80 characters and a five-digit ZIP. The provider result cap is 25. Notes allow 100 characters in the UI and the command schema. Cross-origin writes are rejected. Stable errors include `invalid_request`, `not_found`, `conflict`, `database_unavailable` and `provider_unavailable`.

Neon stores the `patients`, `appointments`, and `appointment_operations` tables. A partial unique index reserves each confirmed slot. Canceling releases the slot. Local notes remain editable on canceled visits. Rescheduling keeps the same doctor and location and saves the replacement time and any note edit together. [Scheduling specification](openspec/specs/appointment-scheduling/spec.md)

The demo serves one synthetic patient on loopback. Chat history lives in the open page, and the server sends OpenAI requests with `store: false`. The deployment consists of one Bun application and Neon. It requires no Redis, worker, job queue, or vector database.

Real Zocdoc access (4-b), multiuser login, external appointment synchronization, hosted deployment, and durable chat transcripts are deferred. A real provider integration would need verified credentials and directory access, plus reconciliation for uncertain write outcomes.
