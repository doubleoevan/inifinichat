# Design

The command validates `.evals/latest.json` or a supplied JSON export with the existing `evalReportSchema`. It selects five stable case IDs spanning search, booking, process restart, real Neon, and real OpenAI. It prints stages in their recorded order, including repeated HTTP calls. Skipped cases have no measured duration. Human review fields are independent of the timing data.

The source records one elapsed time per case and per measured stage. The README identifies the run and describes which probes started a fresh process. The runner does not measure provider cache state.
