# Scheduling evals

Run `bun run evals` from the project root. Use the normal Bun routes, mock adapter, shared schemas and scheduling transactions. Keep expected outputs outside model inputs. Add test data to the disposable PostgreSQL cluster. Any live Neon probe must clean up only its own synthetic records.

**Case-author prompt.** Give a realistic scheduling request, fixture preconditions, the expected response and database effects, and an objective assertion that could fail.

**Reviewer prompt.** Compare the recorded response and state with the expected behavior. Choose Pass, Fail, or Unsure and cite a specific observation. Leave cases you have not reviewed Unreviewed.
