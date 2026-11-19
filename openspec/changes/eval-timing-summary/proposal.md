## Why

The Step 3 eval runner already timed each scenario. A reviewer can use those measurements while another reviewer labels the same run.

## What Changes

- Add a local command that summarizes five representative cases from a saved report.
- Document the observed times and their measurement boundaries in the README.

## Capabilities

### New Capabilities

- `eval-timing-summary` reports recorded case and stage durations from an existing scheduling eval run.

## Impact

The command reads the existing eval report schema and writes to standard output.
