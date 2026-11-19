# Web interface

Use React, Tailwind, the shared UI primitives, and runtime schemas from `@/shared/contracts`. Read or change patient data through same-origin HTTP. Render all patient, model and clinic content as text. The UI owns only in-memory drafts and chat history.

Open a review for the chosen slot or active appointment. Show success from the committed API result. Reuse the request ID when retrying the same confirmed payload. Refresh the schedule after a failed write before enabling retry.

Run `bun test tests/web-review.test.ts`, `bun run typecheck` and `bun run build:ui`. To check manually, select a doctor and an available time, confirm the booking, then edit its local notes or reschedule it. Step 3 can pass its Evals panel to `CareDesk` through the optional `evals` prop.
