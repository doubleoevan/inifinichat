# Appointment storage

Use Bun SQL against the existing Neon database. The scheduling API imports storage from `schedule.ts`. It resolves the synthetic patient on the server.

`bun run db:seed` applies the versioned migration and inserts missing demo records in one transaction. Repeat runs preserve patient edits. Keep provider implementations out of storage. Inject the in-process adapter and strip local notes before a provider call.

`operations.ts` locks the patient for each write, replays the stored result for an identical request, and commits the result with the appointment. The confirmed-slot index also protects bookings across patient IDs.

Run `RUN_NEON_TESTS=1 bun --env-file=.env test tests/scheduling-neon.test.ts` for the opt-in live test. In a feature worktree, use the integration checkout's absolute `.env` path. The test uses a private synthetic provider and removes its own rows.
