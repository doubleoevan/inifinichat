## Purpose

Let reviewers inspect scheduling latency from a saved eval run while human review is in progress.

## ADDED Requirements

### Requirement: Summarize saved timing evidence

The reporting command SHALL read an existing eval report and print its run identity, selected scenarios, modes, statuses, measured totals, recorded stages and errors. Reading the report SHALL leave the source file unchanged and SHALL require no external services.

#### Scenario: Inspect a completed case

- **WHEN** a selected case contains multiple timings for the same stage
- **THEN** the summary displays each timing in its recorded order along with the case total.

#### Scenario: Inspect a skipped case

- **WHEN** the runner skipped a selected case
- **THEN** the summary identifies it as unmeasured and includes the recorded reason.
