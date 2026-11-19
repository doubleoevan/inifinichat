# Inifinichat

Inifinichat is a local appointment desk for one synthetic patient. One Bun process serves a React interface and a JSON API on the loopback address. Search the synthetic directory, select an available slot, and confirm a booking. The desk lets you change the visit time, edit local notes, or cancel. Chat suggests actions for you to review.

## Run locally

Use Bun 1.4.3, Git and Node.js 22.20 or newer for dependency-cruiser. From the project root:

```sh
bun install --frozen-lockfile
test -f .env || cp .env.local .env
bun run hooks:install
bun run dev
```

Open **http://127.0.0.1:3000**. Set `PORT` to choose a different port. The dev command builds the browser bundle and watches the server. After editing the browser code, run `bun run build:ui` and refresh.

Without `DATABASE_URL`, the desk opens a labeled fixture preview and the mock directory. Booking and verified availability require Neon. Add an OpenAI key to the ignored `.env` to enable chat. `OPENAI_MODEL` defaults to `gpt-4.1-mini`. Each chat submission makes one bounded server-side call. Conversations live in page memory.

## Neon Postgres

The declared service in `neon.ts` is Postgres. This checkout was linked to project `bitter-haze-00979726`, branch `production` (`br-solitary-glade-ar54ytjo`). A new checkout needs its own ignored `.neon` link. With the Neon CLI installed and signed in, run:

```sh
neon init -y --org-id org-odd-credit-10225180 --project-id bitter-haze-00979726 --branch production --services postgres
neon deploy
bun run db:seed
bun run dev
```

Keep real values in `.env`. `.env.local` is a public reference. Bun's SQL client reuses the pooled `DATABASE_URL` for app traffic. The migration and seed run together with `bun run db:seed`. They upgrade the original two-table scaffold in place and insert the synthetic patient and visit in the `inifinichat_demo` schema. Repeated seeds preserve the existing rows. A configured but unavailable database produces a service error.

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

The integrated smoke test booked a synthetic slot in Neon, edited its note in the browser, reloaded the page, and restarted Bun. The visit persisted and its slot stayed occupied. A conflicting reschedule preserved the original time and note. Canceling released the slot. A live OpenAI call returned validated search criteria. Both temporary bookings were removed after verification.

The hook validates the staged environment reference and rejects a tracked real environment file. It then runs the same offline dependency-cruiser policy before each commit. Stage all relevant source and checker inputs first. It checks that the worktree matches the index for those inputs. Build artifacts are in `dist/`. Start the built app from the project root.

## Stage 2 ownership

The feature worktrees start at Step 1 commit `017a602`. Their public interfaces are listed below.

| Owner | Paths and public entry points |
| --- | --- |
| Integration | `src/shared/contracts.ts` and `examples.ts`, `src/server/server.ts` and `config.ts`, `src/web/components/ui`, `src/web/lib/utils.ts`, root config, README, shared OpenSpec artifacts and Notion |
| 2-a · Zocdoc | `src/zocdoc/mock.ts`, provider fixtures in `src/fixtures/demo.ts` and `tests/mock.test.ts`. The mock exposes `searchProviders`, `getAvailability`, `bookAppointment`, `cancelAppointment`, and `rescheduleAppointment`. |
| 2-b · Appointments | `src/storage` and seed/migration, `src/conversation/openai.ts`, `src/server/http.ts`, scheduling service and API tests. `createSchedulingRoutes` serves the API, `readSchedule` loads the demo patient, and `changeAppointment` commits confirmed operations. |
| 2-c · UI | `src/web` feature components, styles, HTTP client and UI tests. The shared UI primitives remain with integration. |

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

Appointment commands require a UUID `requestId` and `confirmed: true` from the UI. The server selects the patient. A committed mutation will return `{requestId, appointment}`. Repeating the same request ID and payload returns the original result. Reusing the ID with different content returns a conflict. The desk shows a completed appointment change after Neon commits it.

Slot IDs use `providerId/locationId/UTC-instant`, for example `maya-chen/mission/2030-04-16T17:30:00.000Z`. The location carries its IANA timezone. The directory’s From and Through filters use each clinic’s local date. The synthetic directory offers 30-minute openings on April 16–18, 2030, in Pacific time. Search for **Chen** in **94110** to see two providers. Maya has three candidate slots and Mina has none. Occupied and past slots are excluded from availability. `ZOCDOC_MODE` defaults to `mock` and rejects other values.

## Limits and state

The HTTP body limit is 8 KiB. A chat request accepts 1,500 characters per message and at most six history entries. The server makes one OpenAI call with a 20-second timeout and a 250-token output cap. Provider records, visit notes and contact data stay out of the current model prompt. The model has no tools or authority to confirm a write. The browser renders text through React.

Search terms allow 80 characters and a five-digit ZIP. The provider result cap is 25. Notes allow 100 characters in the UI and the command schema. Cross-origin writes are rejected. Stable errors include `invalid_request`, `not_found`, `conflict`, `database_unavailable` and `provider_unavailable`.

Neon stores the `patients`, `appointments`, and `appointment_operations` tables. A partial unique index reserves each confirmed slot. A short transaction commits the appointment change and the patient's request-ID result together. Canceling releases the slot. Local notes remain editable on canceled visits. Rescheduling keeps the same doctor and location and saves the replacement time and any note edit together. [OpenSpec design](openspec/changes/inifinichat-scheduling/design.md)

The provider and all directory data are synthetic. Real Zocdoc authentication, live directory access, and handling an uncertain outcome after a provider timeout are deferred. The evaluation screen and human labels belong to Step 3.
