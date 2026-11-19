# Mock Zocdoc

Own the in-process fixture adapter in `mock.ts`. Import only shared contracts and deterministic fixtures. Run `bun test tests/mock.test.ts` from the repository root.

`mockZocdoc` implements the shared `SchedulingAdapter`. Search takes a doctor name or specialty and a ZIP. Availability returns future fixture slots at the selected provider location. Only the scheduling service can check occupancy, match an appointment to its owner, or commit a change in Neon.

Booking, cancellation and rescheduling return a synthetic `providerReference` derived from the operation and request ID. The adapter keeps no booking state. Use `createMockZocdoc({ now, failure: { operation: "rescheduleAppointment", code: "conflict" } })` to exercise the failure path with a clock returning epoch milliseconds. Errors expose a stable `code`.

The demo supports mock mode. A real Zocdoc adapter needs authentication, provider-directory access, pending status handling and reconciliation for write timeouts.
