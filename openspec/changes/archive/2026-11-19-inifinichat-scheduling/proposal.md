# Proposal

## Why

A patient needs to find a clinician and manage a visit without switching between chat and a scheduling form. A deterministic mock lets the team demonstrate this flow with one synthetic patient.

## What Changes

Define one scheduling API, a fixture-backed provider, a chat interpreter and a patient workspace. Persist confirmed operations in Neon and use a small human-labeled evaluation suite to verify the integrated app.

## Capabilities

### New Capabilities

- `appointment-scheduling` covers provider search, slots, confirmations, appointment changes and local notes.

## Impact

One Bun server serves React and the API. OpenAI processes scheduling language on the server. Neon stores patient-owned data. Step 1 freezes the interfaces and ownership for three parallel worktrees.
