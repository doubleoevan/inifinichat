# Appointment scheduling

## Purpose

The demo lets one synthetic patient use a local mock provider to find appointments and manage confirmed visits.

## ADDED Requirements

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

### Requirement: Interpret chat as a draft

The assistant SHALL return a validated search, clarification or action draft. A draft alone SHALL leave appointment state unchanged.

#### Scenario: Draft a cancellation
- **WHEN** a model response proposes canceling an appointment
- **THEN** the UI presents the draft for explicit patient confirmation before submitting a mutation

### Requirement: Report unfinished work truthfully

The foundation SHALL expose its shell, health endpoint, contracts and explicit errors for unfinished operations.

#### Scenario: Call an unfinished operation
- **WHEN** a valid request reaches a scaffold-only mutation
- **THEN** the server returns HTTP 501 and a typed error before any provider or database mutation
