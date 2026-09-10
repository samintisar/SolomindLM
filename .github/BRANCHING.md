# GitHub Branching Strategy

This repository uses **GitHub Flow** - a simple, branch-based workflow that's great for continuous delivery.

## Overview

```
main (production)
  ↑
  | pull request + CI checks
  |
feature/* (development)
```

## Rules

| Branch      | Purpose                              | Protection                          |
| ----------- | ------------------------------------ | ----------------------------------- |
| `main`      | Production-ready code                | Protected - requires PR + CI checks |
| `feature/*` | New features, bug fixes, experiments | None                                |

## Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Make Changes

```bash
git add .
git commit -m "Describe your changes"
```

### 3. Push and Create PR

```bash
git push -u origin feature/your-feature-name
# Then create PR on GitHub
```

### 4. CI Checks Run Automatically

See [CI Pipeline Details](#ci-pipeline-details) below for the full list. Required
checks must pass before merge; `Coverage Report`, `Dependency audit (baseline)`,
`Lint (PR title)`, and `PR labeler` run but are not merge-blocking.

### 5. Review & Merge

- All required CI checks pass, conversations resolved
- Self-review the diff (see [Pull requests](#pull-requests)); a second reviewer
  when one is available — this repo runs with 0 required approvals (single
  maintainer, admin-enforced, CI-gated), not because review is optional
- **Squash merge** — the PR title becomes the commit subject, so it must be a
  conventional-commit line (`Lint (PR title)` enforces this)

### 6. Deploy

- `main` branch deploys automatically to production
- Web → Vercel
- Backend → Convex

## Issues

Every change starts as an issue and ends as one squash-merged PR. One issue = one
PR = one logical change.

### Filing

Use the issue forms (`.github/ISSUE_TEMPLATE/`): **Bug report**, **Feature /
enhancement**, or **Tech debt / refactor**. Blank issues are disabled. Security
reports go through a private advisory, not a public issue.

- **Feature** issues must have **acceptance criteria** — a checkbox list of what
  "done" means. The PR is reviewed against that list.
- Name what's **out of scope** so the PR doesn't sprawl.
- Found debt while coding? File a `type:refactor` issue and reference it in a
  code comment (`// TODO(#142): recomputes every render`) — don't leave bare
  TODOs and don't expand the current PR to fix it.

### Labels

Managed as code in [`.github/labels.yml`](labels.yml), synced by
[`labels.yml`](workflows/labels.yml). Every issue carries exactly one label from
each group:

| Group      | Values                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------- |
| `type:`    | `bug` `feature` `refactor` `chore` `docs` `test` `perf`                                    |
| `area:`    | `web` `mobile` `convex` `agents` `rag` `studio` `billing` `auth` `sources` `chat` `ci`    |
| `priority:`| `p0` (prod broken) `p1` (this cycle) `p2` (soon) `p3` (someday)                            |
| `status:`  | `triage` `ready` `in-progress` `blocked` `needs-design` `needs-repro` `stale`              |

### Triage

New issues land as `status:triage` with no priority. Once a week, clear the triage
queue: for each issue either assign `priority:` + `area:` + a milestone and set
`status:ready`, or close it with a one-line reason. Anything you won't do in three
months gets closed. Stale issues (60 days idle) are labelled and auto-closed by
[`stale.yml`](workflows/stale.yml); `priority:p0`/`p1`, `status:blocked`, and
pinned issues are exempt.

### Linking

- Branch name references the issue number: `fix/142-stale-grading-banner`.
- PR body contains `Closes #142` so the issue closes on merge.

## Pull requests

### Authoring

- **One PR = one logical change.** Target < 400 lines changed. If it's bigger,
  split it — a mechanical refactor PR first (no behavior change), the feature on
  top.
- Fill in the template: **What / Why / How to test / Risk**. "How to test" is the
  exact commands or clicks a reviewer runs.
- **Self-review first.** Open your own diff on GitHub and read every line before
  requesting review. Catches debug logs, stray files, missing error handling.
- PR title is conventional-commit form (`fix(studio): …`) — it becomes the squash
  commit. `area:*` labels are applied automatically from changed paths.
- Draft PRs for work in progress; mark ready only when it's reviewable.
- Never merge red required CI. Keep the branch short-lived; rebase on `main` if it
  moves ahead.

### Reviewing

First pass — is it the right change? Does it match the issue's acceptance
criteria? Anything out of scope? Is there a simpler approach? Right size, or split?
Raise these before line-level comments.

Then line by line:

- **Correctness** — edge cases, `null`/`undefined` (web tsconfig is
  `strict: false`), races and OCC-conflict potential in Convex mutations
- **Error handling** — no swallowed errors; failed external calls (Together AI,
  Mistral, Tavily, ZeroEntropy) surface via `toConvexError` / `parseServiceError`
- **Tests** — new query/mutation has a `*.test.ts`; bugfix has a regression test
  that fails without the fix; agent/prompt change ran an eval, not a unit test
- **Convex** — validators on all args, indexes for new query patterns, no
  full-table scans, `_`-prefix for internal modules, schema changes via
  widen-migrate-narrow
- **Authz** — every function that reads/writes user data verifies the caller owns
  the notebook / document / resource
- **Prompts** — no text tuned to eval fixtures (CLAUDE.md → Prompt authoring)

Comment etiquette: prefix non-blocking notes `nit:`; ask ("what happens if
`chunks` is empty?") rather than command; approve with open nits if nothing
blocks. When receiving review, verify each point before applying it; reply "done"
so the reviewer knows what to re-check.

## Branch Naming Conventions

| Prefix      | Usage              | Example                       |
| ----------- | ------------------ | ----------------------------- |
| `feature/`  | New features       | `feature/user-authentication` |
| `fix/`      | Bug fixes          | `fix/payment-webhook`         |
| `refactor/` | Code refactoring   | `refactor/api-structure`      |
| `docs/`     | Documentation only | `docs/readme-update`          |
| `chore/`    | Maintenance tasks  | `chore/update-dependencies`   |

## Commit Message Guidelines

Use clear, descriptive commit messages:

```
feat: add user authentication
fix: resolve stripe webhook timeout
refactor: extract database logic to service layer
docs: update API documentation
chore: upgrade dependencies
```

## Setting Up Branch Protection

### Option 1: Using the Provided PowerShell Script (Windows/PowerShell, Recommended)

```powershell
# Run this from a PowerShell prompt
pwsh -File .github/branch-protection.ps1
```

### Option 2: Manual Setup via GitHub UI

1. Go to **Settings** → **Branches**
2. Click **Add branch protection rule**
3. Enter `main` as the branch name pattern
4. Configure:

   | Setting                             | Value                                       |
   | ----------------------------------- | ------------------------------------------- |
   | Require a pull request              | ✅ (1 approval)                             |
   | Require status checks               | ✅                                          |
   | Require branches to be up to date   | ✅                                          |
   | Require status checks to pass       | `Typecheck (Convex)`, `Typecheck (Web)`, `Typecheck (Expo mobile)`, `Lint (Biome)`, `Lint (Workflows)`, `Unit Tests`, `Build (Web, PR parity)` |
   | Do not allow bypassing the settings | ✅                                          |
   | Require resolution of conversations | Optional                                    |

5. Click **Create**

## CI Pipeline Details

The `.github/workflows/ci.yml` runs on:

- Push to `main`
- Pull requests targeting `main`

**Required** (merge-blocking, enforced in branch protection):

1. **Typecheck (Convex)** - Validates Convex backend TypeScript
2. **Typecheck (Web)** - Validates web TypeScript
3. **Typecheck (Expo mobile)** - Validates mobile TypeScript
4. **Lint (Biome)** - Biome lint + format check
5. **Lint (Workflows)** - actionlint on GitHub workflow files
6. **Unit Tests** - `test:convex` + `test:web` vitest suites, plus the RAG eval fixture dry-run
7. **Build (Web, PR parity)** - Builds the React frontend
8. **Coverage Report** - web coverage floor

**Advisory** (run on PRs, not merge-blocking):

- **Dependency audit (baseline)** - `bun audit`, non-blocking until the baseline is clean
- **Lint (PR title)** - conventional-commit form on the PR title (becomes the squash commit)
- **PR labeler** - applies `area:*` labels from changed paths (`.github/labeler.yml`)

E2E on PRs is skipped with a warning until the `E2E_TEST_*` secrets are set; it is not a required check. Phase 3 of the CI/CD deployment plan wires it to run against the Vercel preview deployment.

Deeper suites are not in CI — run them locally when the change warrants (see CLAUDE.md validation gates): `bun run test:e2e` before merging UI flows, `bun run eval:rag --case=… / --runner=…` or `eval:studio` for agent/prompt changes.

## Code quality over time

The habits and recurring passes that keep the codebase healthy — Boy Scout rule,
tech-debt tracking, the weekly/monthly review cadence, the strictness ratchet, and
which metrics to watch — live in
[`docs/engineering/code-quality.md`](../docs/engineering/code-quality.md).
Architecture decisions go in [`docs/adr/`](../docs/adr/).

A **pre-push hook** (`.githooks/pre-push`, enabled automatically by `bun install`)
runs typecheck + lint before every push. Bypass a WIP push with
`git push --no-verify`.

## Best Practices

1. **Keep branches short-lived** - Merge PRs within a few days
2. **Small, focused PRs** - Easier to review and less likely to introduce bugs
3. **Write clear PR descriptions** - Use the provided template
4. **Don't break the build** - Fix failing CI before merging
5. **Update `main` frequently** - Sync your feature branch if `main` has moved ahead
6. **Leave it better than you found it** - within the scope of your change; bigger cleanups get their own `type:refactor` issue
