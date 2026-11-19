# Inifinichat

Inifinichat is a local appointment desk for one synthetic patient. One Bun process serves a React interface and a JSON API on the loopback address. Search the mock directory, inspect availability, open the patient's schedule, or ask the assistant a scheduling question.

## Run locally

Use Bun 1.4.3, Git and Node.js 22.20 or newer for dependency-cruiser. From the project root:

```sh
bun install --frozen-lockfile
test -f .env || cp .env.local .env
bun run hooks:install
bun run dev
```

Open **http://127.0.0.1:3000**. Set `PORT` to choose a different port. The dev command builds the browser bundle and watches the server. After editing the browser code, run `bun run build:ui` and refresh.

The app uses fixtures when `DATABASE_URL` is empty. Add an OpenAI key to the ignored `.env` to enable chat. `OPENAI_MODEL` defaults to `gpt-4.1-mini`. The server sends one bounded message to the Responses API. Conversations live in page memory. The mock Zocdoc adapter runs inside the server.

## Neon Postgres

The declared service in `neon.ts` is Postgres. This checkout was linked to project `bitter-haze-00979726`, branch `production` (`br-solitary-glade-ar54ytjo`). A new checkout needs its own ignored `.neon` link. With the Neon CLI installed and signed in, run:

```sh
neon init -y --org-id org-odd-credit-10225180 --project-id bitter-haze-00979726 --branch production --services postgres
neon deploy
bun run db:seed
bun run dev
```

Keep real values in `.env`. `.env.local` is a public reference. Bun's SQL client reuses the pooled `DATABASE_URL` for app traffic. The seed uses `DATABASE_URL_UNPOOLED` inside one transaction. It creates the `inifinichat_demo` schema and inserts the synthetic patient and visit. Repeated seeds preserve the existing rows. A configured but unavailable database produces a service error.

## Check and build

```sh
bun run typecheck
bun run boundaries
bun test
npm run build
bun run start
```

The hook validates the staged environment reference and rejects a tracked real environment file. It then runs the same offline dependency-cruiser policy before each commit. Stage all relevant source and checker inputs first. It checks that the worktree matches the index for those inputs. Build artifacts are in `dist/`. Start the built app from the project root.

## Stage 2 ownership

All three worktrees start from the same Step 1 commit. Each feature owner adds focused tests beside their module. The integration owner merges the three branches before evals.

| Owner | Paths and public entry points |
| --- | --- |
| Integration | `src/shared/contracts.ts` and `examples.ts`, `src/server/server.ts` and `config.ts`, `src/web/components/ui`, `src/web/lib/utils.ts`, root config, README, shared OpenSpec artifacts and Notion |
| 2-a · Zocdoc | `src/zocdoc/mock.ts`, provider fixtures in `src/fixtures/demo.ts` and `tests/mock.test.ts`. The mock exposes `searchProviders`, `getAvailability`, `bookAppointment`, `cancelAppointment`, and `rescheduleAppointment`. |
| 2-b · Appointments | `src/storage` and seed/migration, `src/conversation/openai.ts`, `src/server/http.ts`, scheduling service and API tests. `readSchedule` reads the server-selected demo patient. |
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
| `POST /api/chat` | `{message, history?}` → `{reply, intent}`. The shell returns a navigation reply and a null intent. Stage 2 adds validated drafts. |

Appointment commands require a UUID `requestId` and `confirmed: true` from the UI. The server selects the patient. A committed mutation will return `{requestId, appointment}`. Today a well-formed mutation or profile edit returns **501 not_implemented**. The note editor retains an unsaved draft in memory. Stage 2 owns durable note edits.

Slot IDs use `providerId/locationId/UTC-instant`, for example `maya-chen/mission/2030-04-16T17:30:00.000Z`. The location carries its IANA timezone. The directory currently exposes synthetic Bay Area providers and fixed April 2030 times. `ZOCDOC_MODE` defaults to `mock` and rejects other values.

## Limits and state

The HTTP body limit is 8 KiB. A chat request accepts 1,500 characters per message and at most six history entries. The server makes one OpenAI call with a 20-second timeout and a 250-token output cap. Provider records, visit notes and contact data stay out of the current model prompt. The model has no tools or authority to confirm a write. The browser renders text through React.

Search terms allow 80 characters and a five-digit ZIP. The provider result cap is 25. Notes allow 100 characters in the UI and the command schema. Cross-origin writes are rejected. Stable errors include `invalid_request`, `not_found`, `conflict`, `database_unavailable`, `provider_unavailable` and `not_implemented`.

Neon owns durable patient and appointment state. The seed currently creates two tables. Stage 2-b adds `appointment_operations`, confirmed-slot uniqueness, patient/request-ID deduplication and atomic appointment-plus-result writes. Stage 2-a supplies candidate slots. Stage 2-b filters occupied slots and enforces same-provider/location rescheduling. The [OpenSpec design](openspec/changes/inifinichat-scheduling/design.md) records these constraints.

The local browser shell and API are verified independently of feature completion. The evaluation screen and human labels belong to Step 3. No real Zocdoc credentials are required.
