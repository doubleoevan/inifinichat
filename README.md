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

The hook runs the same offline dependency-cruiser policy before each commit. Stage all relevant source and checker inputs first. It checks that the worktree matches the index for those inputs. Build artifacts are in `dist/`. Start the built app from the project root.

## Modules

| Module | Responsibility |
| --- | --- |
| `src/shared` | Patient, appointment, doctor, slot, chat and scheduling contracts |
| `src/fixtures` | Synthetic patient, appointment, directory and candidate slots |
| `src/zocdoc` | In-process mock search and availability |
| `src/storage` | Neon schedule reads and transactional seed |
| `src/conversation` | Server-only OpenAI client |
| `src/server` | Bun server, routes and asset delivery |
| `src/web` | React workspace, Tailwind styles and a shadcn/ui input |

## API and current scope

| Request | Result |
| --- | --- |
| `GET /api/status` | Whether chat is configured |
| `GET /api/schedule` | Synthetic patient, appointments and data source |
| `GET /api/doctors?q=chen&location=Francisco` | Doctors matching the name or specialty and location |
| `GET /api/doctors/maya-chen/availability` | Candidate times from the mock adapter |
| `POST /api/chat` | A JSON reply to `{"message":"How do I find a doctor?"}` |

Booking, cancellation and rescheduling have typed adapter methods that reject calls until implemented. The initial note editor saves to the current browser. Chat has no appointment write tools. All patient, practice, doctor and schedule fixtures are synthetic.
