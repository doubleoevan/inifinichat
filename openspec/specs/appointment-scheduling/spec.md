# Appointment scheduling

## Purpose

The demo lets one synthetic patient use a local mock provider to find appointments and manage confirmed visits.

## Requirements

### Requirement: Find providers and slots

The system SHALL accept a doctor name or specialty with a five-digit US ZIP and display available times with provider, location and timezone.

#### Scenario: Repeat a search
- **WHEN** the same provider and location offer the same instant on two searches
- **THEN** both results identify that slot with the same key

### Requirement: Persist confirmed changes

The server SHALL resolve the patient, require explicit confirmation for appointment mutations and store committed results in Neon. Notes SHALL accept up to 100 characters. Rescheduling SHALL preserve the provider and location.

#### Scenario: Retry after losing the response
- **WHEN** the same patient retries the same confirmed operation with the same request ID and payload
- **THEN** the server returns the original committed result without repeating the write

#### Scenario: Occupied replacement
- **WHEN** the requested replacement slot already has a confirmed appointment
- **THEN** the server returns a conflict and preserves the original appointment and notes

#### Scenario: Restart and cancel
- **WHEN** the patient refreshes the page or restarts Bun against the same database after booking
- **THEN** the visit and its local notes remain visible and the slot stays occupied
- **WHEN** the patient confirms cancellation
- **THEN** the visit becomes canceled and its future slot becomes available

### Requirement: Interpret chat as a draft

The assistant SHALL return a validated search, clarification or action draft. A draft alone SHALL leave appointment state unchanged.

#### Scenario: Draft a cancellation
- **WHEN** a model response proposes canceling an appointment
- **THEN** the UI presents the draft for explicit patient confirmation before submitting a mutation

#### Scenario: Clear the conversation
- **WHEN** the patient clears a conversation containing an unconfirmed draft
- **THEN** the chat clears and the saved patient and appointments stay unchanged

### Requirement: Report database failures

The scheduling API SHALL return a typed service error when the database cannot serve a durable operation.

#### Scenario: Database outage
- **WHEN** the configured database is unreachable during an appointment request
- **THEN** the API returns HTTP 503 with `database_unavailable` and the UI offers a way to check the schedule

### Requirement: Review scheduling evidence

The app SHALL show measured results with their execution modes and permit independent human labels, reviewer notes and JSON export.

#### Scenario: Export a human review
- **WHEN** the reviewer labels an initially unreviewed case and exports the run
- **THEN** the JSON includes the recorded outcome, the chosen label and the reviewer’s notes
