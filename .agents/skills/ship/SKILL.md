---
name: ship
description: Prepare an Infinichat change for human review and an approved commit when the user asks to ship it. Accepts the optional no-ponytail argument.
---

# Ship

Work through these steps in the current checkout. Fix issues within the change and rerun the affected checks. If a required check fails or cannot run, stop at the handoff and identify what blocks the commit.

## 1. Identify the change

Read the request and any applicable project or module instructions. In a Git worktree, use `git status --short` and inspect staged, unstaged, and untracked files. For a branch, include its commits since the merge base with the intended target branch. Name the base you used.

For a first commit, review the proposed files directly. Before Git setup, review the files in scope and finish with the handoff. Preserve unrelated work already in the checkout or index.

## 2. Check the requirements and docs

Match each requested behavior to its implementation and a way to verify it. When the change has OpenSpec artifacts, read its proposal, tasks, and scenarios. Resolve or report discrepancies.

For a moved entry point, renamed script, or changed public contract, check the affected README and module `AGENTS.md` against the tree. For agent-tooling changes, follow each affected discovery path to its target.

## 3. Run the project's checks

Run the project's documented checks locally for the affected modules. Run applicable lint, type, build, and test checks. For a docs or tooling change, check the links and exercise the changed entry point. Record each command and result. Identify any required check you could not run.

## 4. Check the failure paths

Trace the changed behavior locally. Choose checks that could catch a defect in this diff. For example, if retrieval changes, verify document access and that citations point to the supporting passage. If streaming changes, check what happens when a user cancels or retries. If logging changes, check whether private content reaches the logs.

For performance-sensitive changes, exercise the affected path and compare the relevant measurement with the baseline when one exists.

## 5. Simplify the diff

Check new logic against existing helpers and contracts. Review names and comments against neighboring code. Use the project's code-style guidance when a changed file grows hard to follow or takes on a second responsibility.

Apply the installed `ponytail` skill to find code or dependencies the change can do without. The optional `no-ponytail` argument skips this pass. Rerun checks affected by edits.

## 6. Handle integration work

In a feature worktree, verify its scenarios and leave its OpenSpec change open for integration. During the integration change, run the documented full-app checks and any evals required by the affected scenarios. Once they pass, sync and archive completed OpenSpec changes one at a time. Review the resulting spec diff before the handoff.

## 7. Prepare the review handoff

Review the final diff. Stage completed edits by explicit path under the project's `git-discipline` rules. Keep unrelated staged work intact. If the intended changes cannot be committed separately, stop at the handoff and explain the conflict.

Summarize what changed and why, the checks and their results, and any open decision. For behavior that needs human QA, give one action and its expected result per item. Put a long handoff in `logs/ship-report.md` and link it in chat.

## 8. Commit with approval

Show the proposed Conventional Commit message and the exact staged scope. Commit only when the user has approved that scope or already authorized commits for the session. Use a normal `git commit` so the local `pre-commit` hook checks module boundaries against the exact staged snapshot. If the hook rejects the commit, fix the violation, restage the affected paths, and review the staged diff before retrying. Report the commit ID after the commit succeeds. Pushing requires a separate explicit request.
