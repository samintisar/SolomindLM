<!--
Title = the squash-merge commit. Use conventional-commit form:
  feat(chat): stream tool-call results incrementally
  fix(studio): clear grading banner on retry
The "Lint (PR title)" check enforces this.
-->

## What

<!-- One paragraph: what this PR changes. -->

## Why

Closes #<!-- issue -->

<!-- The approach, and any alternative you rejected and why. -->

## How to test

<!-- Exact steps or commands a reviewer runs to see it work.
     e.g. `bun run test:convex -- writtenQuestions`
     or "Open a notebook → generate written questions → submit blank → Finish" -->

## Risk / rollout

<!-- What could break. Delete the lines that don't apply. -->

- Schema/table change → migration: <!-- link the plan, or "n/a" -->
- Prompt/agent change → `cacheVersions` bumped: <!-- yes / n/a -->
- Eval impact → ran `eval:rag` / `eval:studio`: <!-- result, or "n/a" -->
- New env var / secret: <!-- name, or "n/a" -->

## Screenshots

<!-- Before/after for any UI change. Delete if n/a. -->

---

- [ ] Self-reviewed the diff line by line
- [ ] `typecheck:web` + `typecheck:convex` + `lint` pass locally
- [ ] `test:convex` / `test:web` pass (or explain why not applicable)
- [ ] Tests added/updated for the change (regression test for a bugfix; `*.test.ts` for new queries/mutations)
- [ ] Errors surface to the user — no silent catches or fallbacks
- [ ] Convex functions validate all args and have indexes for new query patterns
- [ ] No prompt text tuned to eval fixtures (see CLAUDE.md → Prompt authoring)
