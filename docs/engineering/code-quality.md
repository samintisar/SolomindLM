# Keeping code quality up over time

Issue and PR mechanics are in [`.github/BRANCHING.md`](../../.github/BRANCHING.md).
This is the part that isn't a single PR — the habits and the recurring passes that
keep the codebase from rotting.

## Everyday habits

### Boy Scout rule, bounded

Leave a file a little better than you found it — rename one unclear variable, add
one missing type, delete one dead branch. **Bounded**: don't turn a bug fix into a
500-line refactor. A real refactor is its own `type:refactor` issue and its own
PR.

### Debt goes in the tracker, not in a comment

Found something wrong that's out of scope for what you're doing? File a
`type:refactor` issue and reference it: `// TODO(#142): recomputes on every
render`. Bare `TODO`s with no issue number rot — grep for them quarterly and
either file or delete.

### Don't add to the pile

- No new `any` in a file you're already editing (Biome flags `noExplicitAny` as a
  warning — treat it as a stop sign in changed lines).
- No new function without arg validators / an index for its query pattern (Convex).
- No new `catch` that swallows the error without surfacing it.

## The gates

Automated, non-negotiable:

| Gate | Where |
| ---- | ----- |
| `typecheck:convex` + `typecheck:web` + `typecheck:mobile` + `lint` | pre-push hook (`.githooks/pre-push`) and CI |
| `test:convex` + `test:web` + RAG eval fixture dry-run | CI **Unit Tests** (required) |
| web coverage floor | CI **Coverage Report** (required) |
| conventional PR title, `area:*` labels | CI advisory |

The pre-push hook is set up automatically by `bun install` (`prepare` →
`scripts/setup-git-hooks.mjs`). Bypass a work-in-progress push with
`git push --no-verify`; CI still enforces everything.

Run deeper suites locally when the change warrants (per `CLAUDE.md` validation
gates): `test:e2e` before merging UI flows; `eval:rag --case=… / --runner=…` or
`eval:studio` for agent/prompt changes. Never unit-test prompt outputs.

## Weekly pass (~15 min)

- **Triage** the issue board's Triage column (see BRANCHING.md → Issues).
- **Renovate PRs** — merge green patch/minor; a major bump becomes its own
  `type:chore` issue with a test plan, not a blind merge.
- **Flaky tests** — if a test was re-run to get it green this week, fix it or
  delete it. A test nobody trusts is worse than no test.
- **CI duration** — if the required jobs creep past ~10 min wall time, split or
  cache. Slow CI is CI people skip.

## Monthly pass (~1 hr)

- **`npx convex insights`** — read amplification, OCC contention, function-limit
  warnings. Each flagged function → a `type:perf` issue root-caused in code (use
  the `convex-performance-audit` skill).
- **Eval trend** — record the latest `eval:rag` / `eval:studio` scores. A drop in
  `expected_item_recall` or judge scores since last month is a regression to
  investigate, not noise.
- **Coverage trend** — is the web coverage floor drifting down? Raise the
  threshold when a run comes in comfortably above it (ratchet, never lower).
- **TypeScript strictness** — pick one feature directory under `apps/web/src/` or
  `convex/`, make it clean under `strict: true`, and add it to a per-directory
  strict include. Track progress in the ratchet issue.
- **Dependency majors** — any major bumps Renovate is holding back? Schedule them.

## Architecture decisions

Anything hard to reverse, contested, or constraining goes in an ADR:
[`docs/adr/`](../adr/). Write it in the PR that makes the change.

## Metrics that matter here

| Signal | Healthy | Where |
| ------ | ------- | ----- |
| Convex read amplification / OCC conflicts | flat or falling | `npx convex insights` |
| RAG / studio eval scores | flat or rising month-over-month | `eval:rag`, `eval:studio` |
| Web coverage | at or above the floor, ratcheting up | CI **Coverage Report** |
| Required CI wall time | < ~10 min | Actions tab |
| Re-run-to-green rate | ~zero | your memory of the week |
| Open `type:refactor` issues with no milestone | small and shrinking | issue board |
