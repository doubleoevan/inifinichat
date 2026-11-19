# Design

## Context

The scaffold already has a Bun server, React shell, working mock reads, a live Neon patient/visit and server-side OpenAI responses. Keep these entry points operational during integration.

## Goals / Non-Goals

Freeze fixtures, DTOs and public entry points before parallel work. Chat stays in memory. Real Zocdoc access and a timing report are deferred.

## Decisions

- A slot key combines provider ID, location ID and the UTC ISO instant. The location also declares an IANA timezone for display. This survives equivalent input offsets and restarts.
- The mock owns deterministic candidate slots and synthetic confirmations. The scheduling service resolves patient ownership and filters already occupied slots in Neon. Its transaction is the sole authority for success.
- Keep three tables in `inifinichat_demo`. `patients` owns the synthetic profile. `appointments` owns patient ID, provider/location IDs, canonical slot, absolute instant, timezone, status, notes and timestamps. `appointment_operations` owns patient ID, request UUID, payload hash and committed result. The Stage 2 migration must retain the existing seed.
- Require uniqueness on confirmed slots and on (patient ID, request ID). Compare the payload hash on replay. Commit the appointment update and operation result atomically. A different payload for a reused ID returns a conflict.
- Notes belong to the app's database. Contacts and notes are unnecessary model context. Chat only proposes actions. The browser sends validated confirmed commands with one request ID per operation.
- Runtime schemas and examples live in `src/shared`. Use the README ownership table when assigning work. All three Stage 2 worktrees branch from the same verified Step 1 commit.

## Risks / Trade-offs

The fixed synthetic catalog limits search coverage. Let users see the mock source and fixture window. A loopback-only app assumes one local operator. Add authentication before exposing it to other users.
