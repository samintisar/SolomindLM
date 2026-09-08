# CI/CD Pipeline, Deployment Safety & Observability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close CI correctness holes, speed up CI with caching, add post-deploy smoke checks + a rollback runbook + env-drift detection, add error tracking / log retention / uptime monitoring for the web and Convex surfaces, and add dependency-update automation + security scanning.

**Architecture:** Five independently shippable phases, one PR each, merged in order `1 → 2 → 3 → 3.5 → 4`. Phase 2 introduces a composite GitHub Action that Phases 3 and 3.5 reuse. Deployment-time checks hang off Vercel's `deployment_status` webhook events. CI/CD config is not unit-testable, so most tasks verify by pushing a branch and observing the GitHub Actions run; the one pure-logic module (env-drift parser) gets real tests.

**Tech Stack:** GitHub Actions, Bun 1.2.2, Vercel, Convex 1.42.3, Playwright, Vitest 4, Biome 2, Renovate, CodeQL, Sentry (`@sentry/react`), Convex Sentinel, Axiom (Convex Log Stream), BetterStack/Checkly (uptime).

**Legend:** Steps marked **[OPERATOR]** require a human acting in a third-party dashboard (GitHub repo settings, Vercel, Convex, Sentry, Axiom, uptime provider). An agent cannot perform these — it must stop and hand off. All other steps are agent-executable.

---

## File Structure

### Phase 1 — CI correctness
| Path | Create/Modify | Responsibility |
|---|---|---|
| `.github/workflows/ci.yml` | Modify | Add `typecheck-web` job; add `actionlint` job; add E2E secret guard step; add `typecheck-web` to build jobs' `needs` |
| `.github/branch-protection.ps1` | Modify | Replace ghost status-check contexts with real job names |
| `.github/BRANCHING.md` | Modify | Sync CI job / required-check names |
| `CONTRIBUTING.md` | Modify | Sync CI check names |

### Phase 2 — CI performance
| Path | Create/Modify | Responsibility |
|---|---|---|
| `.github/actions/setup/action.yml` | Create | Composite: checkout + Bun + dependency cache + install |
| `.github/workflows/ci.yml` | Modify | Replace per-job setup boilerplate with the composite; drop `test-unit` `needs: [lint]`; add Playwright browser cache |

### Phase 3 — Deployment safety
| Path | Create/Modify | Responsibility |
|---|---|---|
| `docs/superpowers/specs/2026-09-08-convex-preview-spike-outcome.md` | Create | Record spike findings + decision |
| `apps/web/vercel.json` | Modify (conditional) | Per-PR Convex preview backend, if spike says viable |
| `.github/workflows/ci.yml` | Modify (conditional) | Update `typecheck-convex` guard assertions if `vercel.json` changes |
| `.github/workflows/e2e-preview.yml` | Create | Run Playwright against the Vercel preview URL on `deployment_status` |
| `playwright.config.ts` | Modify | Remove the silent `skipE2EInCI` ignore branch |
| `.github/workflows/deploy-smoke.yml` | Create | Curl root + `/api/health` after a successful deploy |
| `scripts/lib/envDrift.mjs` | Create | Pure functions: parse `convex env list` output, diff against required keys |
| `scripts/lib/envDrift.test.mjs` | Create | Tests for the parser + differ |
| `scripts/check-convex-env-drift.mjs` | Create | CLI wrapper: shells out to `convex env list --prod`, calls the lib, exits non-zero on drift |
| `scripts/convex-required-env.json` | Create | Canonical `required` / `optional` production env-var key lists |
| `.github/workflows/env-drift.yml` | Create | Weekly + manual run of the drift check |
| `docs/runbooks/rollback.md` | Create | Frontend + backend rollback procedure, triage, comms |
| `package.json` | Modify | Add `test:scripts` and `check:env-drift` scripts |
| `README.md` | Modify | Link the rollback runbook from the Deployment section |

### Phase 3.5 — Observability
| Path | Create/Modify | Responsibility |
|---|---|---|
| `apps/web/package.json` | Modify | Add `@sentry/react` |
| `apps/web/src/sentry.ts` | Create | Browser Sentry init, guarded by `VITE_SENTRY_DSN` |
| `apps/web/src/index.tsx` | Modify | Import `./sentry` first; wrap render in a Sentry error boundary |
| `apps/web/.env.example` or root `.env.example` | Modify | Document `VITE_SENTRY_DSN` |
| `convex/_lib/observability/errorCapture.ts` | Create | Convex-side error capture (Sentinel primary; Sentry-via-fetch alternative) |
| `convex/_lib/serviceErrors.ts` | Modify | Call `captureException` from `toConvexError` |
| `docs/runbooks/observability.md` | Create | Sentry projects, Axiom dataset + queries, uptime monitor, deploy webhook |
| `.github/workflows/deploy-smoke.yml` | Modify | Post result to `DEPLOY_WEBHOOK_URL` |
| `.github/workflows/e2e-preview.yml` | Modify | Post failure to `DEPLOY_WEBHOOK_URL` |

### Phase 4 — Hardening
| Path | Create/Modify | Responsibility |
|---|---|---|
| `renovate.json` | Create | Grouped weekly dependency PRs + action digest pinning + lockfile maintenance |
| `.github/workflows/codeql.yml` | Create | CodeQL JS/TS scan on push + PR + weekly |
| `.github/CODEOWNERS` | Create | Default owner + sensitive-path owners |
| `.github/workflows/ci.yml` | Modify | Add `bun audit` step (non-blocking baseline); run `test-coverage` on PRs |
| `apps/web/vitest.config.ts` | Modify | Add `coverage.thresholds` set to current measured values |

---

## PHASE 1 — CI correctness

Branch: `ci/phase-1-correctness` off `main`.

### Task 1: Add the `typecheck-web` CI job

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add the job**

Insert a new job after the `typecheck-convex` job block (after its last line, before `lint:`). Match the existing style exactly:

```yaml
  typecheck-web:
    name: Typecheck (Web)
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: "1.2.2"

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Typecheck Web
        run: bun run typecheck:web
```

- [ ] **Step 2: Gate the build jobs on it**

In `.github/workflows/ci.yml`, change both build jobs' `needs` arrays:

- `build-web`: `needs: [typecheck-convex, typecheck-mobile]` → `needs: [typecheck-convex, typecheck-web, typecheck-mobile]`
- `build-web-main`: `needs: [typecheck-convex, typecheck-mobile]` → `needs: [typecheck-convex, typecheck-web, typecheck-mobile]`

- [ ] **Step 3: Verify the command works locally**

Run: `bun run typecheck:web`
Expected: exits 0 (no type errors on current `main`). If it fails, the failures are pre-existing and must be fixed or triaged before this task can land — report them.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add web typecheck job and gate builds on it"
```

### Task 2: Add a workflow-lint (`actionlint`) job

**Files:**
- Modify: `.github/workflows/ci.yml`

Job id `workflow-lint`; display name `Lint (Workflows)` to match the file's
`<Verb> (<Scope>)` naming convention (`Lint (Biome)`, `Typecheck (Web)`, …).
Run actionlint via its pinned official Docker image — there is no
`raszi/actionlint` action and `rhysd/actionlint` publishes no JS/composite
action, only the container. The image bundles `shellcheck`, so it also lints
every `run:` block in the workflows.

- [ ] **Step 1: Add the job**

Insert after the `lint:` job block:

```yaml
  workflow-lint:
    name: Lint (Workflows)
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Run actionlint
        uses: docker://rhysd/actionlint:1.7.7
        with:
          args: -color
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: lint workflow files with actionlint"
```

### Task 3: Make the E2E job skip visibly (not silently, not red) when secrets are missing

**Files:**
- Modify: `.github/workflows/ci.yml`

Rationale: a hard `exit 1` when the `E2E_TEST_*` secrets are absent leaves a red
check on every PR until Phase 3, which reads as a broken pipeline and trains
reviewers to ignore red. Instead the job ends green with a `::warning::`
annotation and skips its real steps. When the secrets are set (or Phase 3
replaces this job), E2E runs for real. This whole `test-e2e` job is removed in
Phase 3 Task 15.

- [ ] **Step 1: Add a gate step and guard the real steps**

In the `test-e2e` job, insert a gate step as the **first** step (before `Checkout`)
and add `if: steps.e2e_secrets.outputs.run == 'true'` to every subsequent step:

```yaml
      - name: Check for E2E secrets
        id: e2e_secrets
        env:
          E2E_TEST_EMAIL: ${{ secrets.E2E_TEST_EMAIL }}
          E2E_TEST_PASSWORD: ${{ secrets.E2E_TEST_PASSWORD }}
        run: |
          if [ -z "${E2E_TEST_EMAIL}" ] || [ -z "${E2E_TEST_PASSWORD}" ]; then
            echo "::warning::E2E_TEST_EMAIL / E2E_TEST_PASSWORD repo secrets are not set — E2E suite skipped. Phase 3 wires E2E to the Vercel preview deployment."
            echo "run=false" >> "$GITHUB_OUTPUT"
          else
            echo "run=true" >> "$GITHUB_OUTPUT"
          fi

      - name: Checkout
        if: steps.e2e_secrets.outputs.run == 'true'
        uses: actions/checkout@v4

      - name: Setup Bun
        if: steps.e2e_secrets.outputs.run == 'true'
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: "1.2.2"

      - name: Install dependencies
        if: steps.e2e_secrets.outputs.run == 'true'
        run: bun install --frozen-lockfile

      - name: Install Playwright browsers
        if: steps.e2e_secrets.outputs.run == 'true'
        run: bunx playwright install --with-deps chromium

      - name: Run E2E tests (shard ${{ matrix.shard }}/${{ matrix.total }})
        if: steps.e2e_secrets.outputs.run == 'true'
        env:
          E2E_TEST_EMAIL: ${{ secrets.E2E_TEST_EMAIL }}
          E2E_TEST_PASSWORD: ${{ secrets.E2E_TEST_PASSWORD }}
        run: bunx playwright test --shard=${{ matrix.shard }}/${{ matrix.total }}

      - name: Upload test results
        if: failure() && steps.e2e_secrets.outputs.run == 'true'
        uses: actions/upload-artifact@v4
        with:
          name: e2e-results-shard-${{ matrix.shard }}
          path: |
            playwright-report/
            test-results/
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: skip E2E with a warning when secrets are absent instead of failing"
```

### Task 4: Fix branch-protection status-check contexts

**Files:**
- Modify: `.github/branch-protection.ps1`

- [ ] **Step 1: Replace the `checks` array**

In `.github/branch-protection.ps1`, replace the `required_status_checks` block:

```powershell
    required_status_checks = @{
        strict = $true
        checks = @(
            @{ context = "Typecheck (Convex)" }
            @{ context = "Typecheck (Web)" }
            @{ context = "Typecheck (Expo mobile)" }
            @{ context = "Lint (Biome)" }
            @{ context = "Lint (Workflows)" }
            @{ context = "Unit Tests" }
            @{ context = "Build (Web, PR parity)" }
        )
    }
```

- [ ] **Step 2: Update the summary echo lines**

Change the `Write-Host "  - Require status checks: ..."` line to list: `Typecheck Convex/Web/Mobile, Lint Biome/Workflows, Unit Tests, Build Web`.
Add a comment above the `checks` array:

```powershell
    # NOTE: E2E is intentionally not a required check. Phase 3 of the CI/CD deployment plan
    # (docs/superpowers/plans/2026-09-08-cicd-deployment-observability.md) moves it to a
    # deployment_status-triggered advisory job; promote to required only once stable.
```

- [ ] **Step 3: Commit**

```bash
git add .github/branch-protection.ps1
git commit -m "ci: point branch protection at real status-check names"
```

- [ ] **Step 4: [OPERATOR] Apply the rules**

From a machine with the GitHub CLI authenticated as a repo admin:

```bash
pwsh -File .github/branch-protection.ps1
```

Then in GitHub → Settings → Branches → `main`, confirm the seven checks above are listed under "Require status checks to pass before merging".

### Task 5: Sync docs to real CI names

**Files:**
- Modify: `.github/BRANCHING.md`
- Modify: `CONTRIBUTING.md`

- [ ] **Step 1: `BRANCHING.md`**

- In "### 4. CI Checks Run Automatically", replace the bullet list (`Type Check (API)` / `Build (Web)` / `Build (API)`) with:
  ```
  - Typecheck (Convex), Typecheck (Web), Typecheck (Expo mobile)
  - Lint (Biome), Lint (Workflows)
  - Unit Tests
  - Build (Web, PR parity)
  ```
- In "## CI Pipeline Details" → "Jobs:", replace the two-item list with the same seven-check list, plus a line: "E2E on PRs is skipped with a warning until the `E2E_TEST_*` secrets are set; it is not a required check. Phase 3 wires it to run against the Vercel preview deployment."
- In "### Option 2: Manual Setup via GitHub UI", update the "Require status checks to pass" row value to spell out all seven exact names: `` `Typecheck (Convex)`, `Typecheck (Web)`, `Typecheck (Expo mobile)`, `Lint (Biome)`, `Lint (Workflows)`, `Unit Tests`, `Build (Web, PR parity)` `` (operators type these literally into the GitHub UI — no shorthand).

- [ ] **Step 2: `CONTRIBUTING.md`**

Find the line under the PR steps that reads "**Wait for CI** to pass (typecheck, build, tests)" and expand it to spell out the exact check names: "**Wait for CI** to pass — Typecheck (Convex), Typecheck (Web), Typecheck (Expo mobile), Lint (Biome), Lint (Workflows), Unit Tests, Build (Web, PR parity)."

- [ ] **Step 3: Commit**

```bash
git add .github/BRANCHING.md CONTRIBUTING.md
git commit -m "docs: sync CI check names in branching and contributing guides"
```

### Task 6: Open the Phase 1 PR and verify the run

- [ ] **Step 1: Push and open a PR**

```bash
git push -u origin ci/phase-1-correctness
gh pr create --fill --base main --title "ci: Phase 1 — correctness (web typecheck, workflow lint, branch protection)"
```

- [ ] **Step 2: Observe the Actions run on the PR**

Run: `gh pr checks --watch`
Expected job list on the PR: `Typecheck (Convex)`, `Typecheck (Web)`, `Typecheck (Expo mobile)`, `Lint (Biome)`, `Lint (Workflows)`, `Unit Tests`, `Build (Web, PR parity)`, `E2E Tests (1/2)`, `E2E Tests (2/2)`.
Expected outcome: **every check green.** When the `E2E_TEST_*` secrets are unset, the two `E2E Tests` shards pass with a `::warning::` annotation and their real steps skipped (`Check for E2E secrets` succeeds, everything after is skipped). `Coverage Report` and `Build web (main, …)` show as skipped (main-only). Confirm `gh pr view <n> --json mergeStateStatus` is `CLEAN`.

- [ ] **Step 3: Merge**

Squash-merge once all required checks are green.

---

## PHASE 2 — CI performance

Branch: `ci/phase-2-performance` off `main` (after Phase 1 merges).

### Task 7: Create the composite setup action

**Files:**
- Create: `.github/actions/setup/action.yml`

- [ ] **Step 1: Write the composite action**

```yaml
name: Setup workspace
description: Checkout, install Bun (version from package.json), restore the dependency cache, and install dependencies.
runs:
  using: composite
  steps:
    - name: Checkout
      uses: actions/checkout@v4

    - name: Setup Bun
      uses: oven-sh/setup-bun@v2
      with:
        bun-version-file: package.json

    - name: Restore dependency cache
      uses: actions/cache@v4
      with:
        path: ~/.bun/install/cache
        key: bun-${{ runner.os }}-${{ hashFiles('bun.lock') }}
        restore-keys: |
          bun-${{ runner.os }}-

    - name: Install dependencies
      run: bun install --frozen-lockfile
      shell: bash
```

- [ ] **Step 2: Commit**

```bash
git add .github/actions/setup/action.yml
git commit -m "ci: add composite setup action (bun + dependency cache)"
```

### Task 8: Adopt the composite action in every job

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Replace the setup trio in each job**

For **every** job (`typecheck-convex`, `typecheck-web`, `lint`, `test-unit`, `test-coverage`, `typecheck-mobile`, `build-web`, `build-web-main`, `test-e2e`), delete these three steps:

```yaml
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: "1.2.2"

      - name: Install dependencies
        run: bun install --frozen-lockfile
```

and replace with a single step:

```yaml
      - name: Setup
        uses: ./.github/actions/setup
```

Keep every job's own remaining steps unchanged. For `typecheck-convex`, the `Assert Vercel production build runs convex deploy` step must stay and must come **after** `- uses: ./.github/actions/setup` is fine, but it does not need the workspace — leave it where it is (it only needs the checkout, which the composite now provides, so it must move to after the `Setup` step). Put `Setup` first, then the assert step, then `Typecheck Convex`.

For `test-e2e`, keep the Task 3 `Check for E2E secrets` gate step first, then `Setup`, then the Playwright steps (all still carrying `if: steps.e2e_secrets.outputs.run == 'true'`).

- [ ] **Step 2: Verify no stray `oven-sh/setup-bun@v1` remain**

Run: `grep -n "setup-bun@v1\|frozen-lockfile" .github/workflows/ci.yml`
Expected: no matches (the composite owns both now).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: use composite setup action in all jobs"
```

### Task 9: Cache Playwright browsers; de-serialize test-unit

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Drop the lint dependency from `test-unit`**

Change `test-unit`'s `needs: [lint]` to remove it entirely (delete the `needs:` line). Lint still runs and is still a required check.

- [ ] **Step 2: Cache Playwright browsers in `test-e2e`**

In the `test-e2e` job, replace the `Install Playwright browsers` step with:

```yaml
      - name: Cache Playwright browsers
        id: pw-cache
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('bun.lock') }}

      - name: Install Playwright browsers
        if: steps.pw-cache.outputs.cache-hit != 'true'
        run: bunx playwright install --with-deps chromium

      - name: Install Playwright OS deps (cache hit)
        if: steps.pw-cache.outputs.cache-hit == 'true'
        run: bunx playwright install-deps chromium
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: cache Playwright browsers; run unit tests without waiting on lint"
```

### Task 10: Open the Phase 2 PR and verify caching

- [ ] **Step 1: Push and open a PR**

```bash
git push -u origin ci/phase-2-performance
gh pr create --fill --base main --title "ci: Phase 2 — performance (composite setup, caching)"
```

- [ ] **Step 2: First run — populate caches**

Run: `gh pr checks --watch`
Expected: all required checks green. In the logs of any job, the "Restore dependency cache" step shows `Cache not found` on this first run.

- [ ] **Step 3: Second run — confirm cache hits**

Push an empty commit: `git commit --allow-empty -m "ci: trigger cache-hit run" && git push`
Expected: "Restore dependency cache" now logs `Cache restored from key: bun-Linux-<hash>`; `bun install` completes faster; overall workflow wall-clock is lower than the Phase 1 baseline. Record both numbers in the PR description.

- [ ] **Step 4: Merge** (squash).

### Task 11: Investigate the Tavily key in unit tests

**Files:** none (investigation; result recorded in the Phase 2 PR or a follow-up).

- [ ] **Step 1: Search for Tavily usage reachable from `test:convex`**

Run: `grep -rn "TAVILY_API_KEY\|tavily" convex --include=*.ts -l`
Then check whether any of those modules are imported by a `*.test.ts` under `convex/` without being mocked.

- [ ] **Step 2: Decide and note**

- If no test path calls Tavily: open a follow-up removing `TAVILY_API_KEY` from the `test-unit` env in `ci.yml`.
- If some test does: leave it, and add a comment in `ci.yml` above the env block naming the test file that needs it.

Record the finding in the PR description. No commit if nothing changes.

---

## PHASE 3 — Deployment safety

Branch: `ci/phase-3-deployment-safety` off `main` (after Phase 2 merges). Phase 3 may be split: land Task 12 (spike) first, then the rest.

### Task 12: Spike — Convex preview deployments

**Files:**
- Create: `docs/superpowers/specs/2026-09-08-convex-preview-spike-outcome.md`

- [ ] **Step 1: [OPERATOR] Gather facts from the Convex dashboard**

In the Convex dashboard for this project, record:
- Plan tier (preview deployments require a paid plan).
- Whether a **Preview** deploy key can be created (Settings → Deploy keys).
- Rough incremental monthly cost of preview deployments at expected PR volume.

- [ ] **Step 2: Check CLI capability**

Run: `bunx convex deploy --help | grep -A2 preview`
Expected: `--preview-create <name>` and `--preview-run <function>` flags are listed (Convex ≥ 1.13 has these; the repo pins `convex@1.42.3`).

- [ ] **Step 3: Write the outcome doc**

Create `docs/superpowers/specs/2026-09-08-convex-preview-spike-outcome.md` with these sections, filled in from Steps 1–2:

```markdown
# Convex Preview Deployments — Spike Outcome

**Date:** <fill>
**Decision:** VIABLE | NOT VIABLE

## Findings
- Plan tier: <...>
- Preview deploy key available: yes/no
- Estimated cost: <...>
- CLI supports --preview-create: yes/no

## Chosen approach
<one of:>
- VIABLE: per-PR Convex backend via `convex deploy --preview-create`. Tasks 13–14 apply.
- NOT VIABLE: previews point at a dedicated non-prod Convex dev deployment
  `<deployment name>` via Vercel Preview env vars. Task 13 skipped; Task 14 (guard) skipped.

## E2E test account
<where the E2E_TEST_* account lives in the chosen backend, and whether global-setup
needs a sign-up step or a seed>
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-08-convex-preview-spike-outcome.md
git commit -m "docs: record Convex preview-deployment spike outcome"
```

### Task 13: Wire per-PR Convex previews — **only if spike = VIABLE**

**Files:**
- Modify: `apps/web/vercel.json`

- [ ] **Step 1: Update the preview branch of `buildCommand`**

In `apps/web/vercel.json`, change `buildCommand` so the preview branch creates a preview deployment:

```json
  "buildCommand": "cd ../.. && if [ \"$VERCEL_ENV\" = \"preview\" ]; then bun x convex deploy --preview-create \"$VERCEL_GIT_COMMIT_REF\" --cmd \"bun run build:prod\" --cmd-url-env-var-name VITE_CONVEX_URL; else bun x convex deploy --cmd \"bun run build:prod\" --cmd-url-env-var-name VITE_CONVEX_URL; fi",
```

- [ ] **Step 2: [OPERATOR] Set the Vercel Preview deploy key**

In Vercel → Project → Settings → Environment Variables: set `CONVEX_DEPLOY_KEY` scoped to **Preview** only to the Convex **Preview** deploy key. Confirm the **Production** `CONVEX_DEPLOY_KEY` (Production scope) is unchanged.

- [ ] **Step 3: Commit**

```bash
git add apps/web/vercel.json
git commit -m "ci: create a per-PR Convex preview backend on Vercel preview builds"
```

### Task 14: Update the `vercel.json` guard test — **only if Task 13 ran**

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Rewrite the assertions**

In the `typecheck-convex` job, replace the `Assert Vercel production build runs convex deploy` step's script with:

```bash
          set -e
          f=apps/web/vercel.json
          grep -qF 'convex deploy' "$f" || { echo "::error::$f buildCommand must run convex deploy"; exit 1; }
          grep -qF 'VERCEL_ENV' "$f" || { echo "::error::$f buildCommand must branch on VERCEL_ENV"; exit 1; }
          grep -qF 'preview-create' "$f" || { echo "::error::preview branch must use convex deploy --preview-create so previews never touch prod Convex"; exit 1; }
          # Non-preview branch must NOT use --preview-create
          node -e '
            const c = require("./apps/web/vercel.json").buildCommand;
            const elseBranch = c.split("else")[1] || "";
            if (elseBranch.includes("preview-create")) { console.error("::error::non-preview build must not use --preview-create"); process.exit(1); }
          '
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: guard test now requires preview-create on the preview branch only"
```

### Task 15: E2E against the Vercel preview deployment

**Files:**
- Create: `.github/workflows/e2e-preview.yml`
- Modify: `playwright.config.ts`
- Modify: `.github/workflows/ci.yml` (remove the old `test-e2e` job)

- [ ] **Step 1: Remove the old `test-e2e` job**

Delete the entire `test-e2e:` job from `.github/workflows/ci.yml` (including the Task 3 guard step — it is superseded).

- [ ] **Step 2: Create `.github/workflows/e2e-preview.yml`**

```yaml
name: E2E (preview)

on:
  deployment_status:

concurrency:
  group: e2e-preview-${{ github.event.deployment.ref }}
  cancel-in-progress: true

jobs:
  e2e:
    name: E2E vs preview (${{ matrix.shard }}/2)
    # Vercel posts environment "Preview"; only run on a successful preview deploy.
    if: >
      github.event.deployment_status.state == 'success' &&
      github.event.deployment_status.environment == 'Preview'
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2]
    steps:
      - name: Checkout the deployed commit
        uses: actions/checkout@v4
        with:
          ref: ${{ github.event.deployment.sha }}

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version-file: package.json

      - name: Restore dependency cache
        uses: actions/cache@v4
        with:
          path: ~/.bun/install/cache
          key: bun-${{ runner.os }}-${{ hashFiles('bun.lock') }}
          restore-keys: bun-${{ runner.os }}-

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Cache Playwright browsers
        id: pw-cache
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('bun.lock') }}

      - name: Install Playwright browsers
        if: steps.pw-cache.outputs.cache-hit != 'true'
        run: bunx playwright install --with-deps chromium

      - name: Install Playwright OS deps (cache hit)
        if: steps.pw-cache.outputs.cache-hit == 'true'
        run: bunx playwright install-deps chromium

      - name: Run E2E against the preview
        env:
          PLAYWRIGHT_BASE_URL: ${{ github.event.deployment_status.target_url }}
          E2E_TEST_EMAIL: ${{ secrets.E2E_TEST_EMAIL }}
          E2E_TEST_PASSWORD: ${{ secrets.E2E_TEST_PASSWORD }}
        run: bunx playwright test --shard=${{ matrix.shard }}/2

      - name: Upload report on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-preview-report-shard-${{ matrix.shard }}
          path: |
            playwright-report/
            test-results/
```

(This workflow does not use the local composite action: `deployment_status` events check out the default branch by default, and `./.github/actions/setup` would resolve to the default-branch copy anyway, but pinning `ref` to the deployed SHA above and inlining the setup keeps the deployed-code and test-runner versions consistent.)

- [ ] **Step 3: Remove the silent-skip branch in `playwright.config.ts`**

In `playwright.config.ts`:
- Delete the `skipE2EInCI` const and every use of it: `testIgnore` becomes `undefined` (or drop the property), `globalSetup` becomes the plain string `"./e2e/global-setup.ts"`, and the `storageState` spread becomes unconditional: `storageState: ".auth/storageState.json" as const`.
- Keep the `.env.e2e` loader and the `hasE2ECreds` computation is no longer needed — `e2e/global-setup.ts` already throws a clear error when creds are missing, which is the desired loud failure.

Resulting `use` block:

```ts
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    storageState: ".auth/storageState.json" as const,
  },
```

- [ ] **Step 4: [OPERATOR] Confirm the E2E account exists in the preview backend**

Per the spike outcome doc: ensure `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` identify a verified account in whatever Convex backend previews use. If per-PR preview backends are in play and the account is not auto-seeded, add a seed step or a sign-up path in `e2e/global-setup.ts` (out of scope to design here — note it in the spike doc and open a follow-up).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/e2e-preview.yml .github/workflows/ci.yml playwright.config.ts
git commit -m "ci: run E2E against the Vercel preview deployment on deployment_status"
```

### Task 16: Post-deploy smoke check

**Files:**
- Create: `.github/workflows/deploy-smoke.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: Deploy smoke check

on:
  deployment_status:

jobs:
  smoke:
    if: github.event.deployment_status.state == 'success'
    runs-on: ubuntu-latest
    env:
      TARGET_URL: ${{ github.event.deployment_status.target_url }}
      ENVIRONMENT: ${{ github.event.deployment_status.environment }}
    steps:
      - name: Root responds with the app shell
        run: |
          set -e
          body="$(curl -fsS --retry 3 --retry-delay 5 --max-time 30 "$TARGET_URL")"
          echo "$body" | grep -q '<div id="root">' || {
            echo "::error::Root page at $TARGET_URL did not contain <div id=\"root\"> — deploy may be broken"
            exit 1
          }

      - name: Convex health endpoint responds
        run: |
          set -e
          code="$(curl -fsS -o /tmp/health.txt -w '%{http_code}' --retry 3 --retry-delay 5 --max-time 30 "$TARGET_URL/api/health")"
          echo "status=$code body=$(cat /tmp/health.txt)"
          test "$code" = "200" || {
            echo "::error::$TARGET_URL/api/health returned $code"
            exit 1
          }

      - name: Custom domain (production only)
        if: env.ENVIRONMENT == 'Production'
        run: |
          set -e
          curl -fsS --retry 3 --retry-delay 5 --max-time 30 "https://www.solomindlm.com/api/health" >/dev/null
```

- [ ] **Step 2: Verify the health-check assumptions**

Run: `grep -n -A8 '"/health"' convex/http.ts`
Confirm `GET /health` exists and returns 200 with a JSON body. Confirm `apps/web/vercel.json` `routes` proxies `/api/(.*)` to `${VITE_CONVEX_SITE_URL}/api/$1` (it does). Confirm `apps/web/index.html` contains `<div id="root">` — run `grep -n 'id="root"' apps/web/index.html`; if the marker differs, use the actual one in Step 1.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-smoke.yml
git commit -m "ci: smoke-check root + Convex health after every successful deploy"
```

### Task 17: Env-drift detection — pure lib + tests (TDD)

**Files:**
- Create: `scripts/lib/envDrift.mjs`
- Create: `scripts/lib/envDrift.test.mjs`
- Create: `scripts/convex-required-env.json`
- Modify: `package.json`

- [ ] **Step 1: Add the canonical key list**

`scripts/convex-required-env.json` — the engineer MUST reconcile this against `.env.example` and the live prod deployment; start from this and adjust:

```json
{
  "required": [
    "SITE_URL",
    "AUTH_GOOGLE_ID",
    "AUTH_GOOGLE_SECRET",
    "JWKS",
    "JWT_PRIVATE_KEY",
    "TOGETHER_AI_API_KEY",
    "TAVILY_API_KEY",
    "MISTRAL_API_KEY",
    "SUPADATA_API_KEY",
    "ZEROENTROPY_API_KEY",
    "ZEROENTROPY_RERANK_MODEL",
    "FAST_LLM",
    "SMART_LLM",
    "REPORT_LLM",
    "FLASHCARDS_LLM",
    "QUIZ_LLM",
    "MINDMAP_LLM",
    "SPREADSHEET_LLM",
    "WRITTEN_QUESTIONS_LLM",
    "AUDIO_LLM",
    "AUDIO_VOICE_HOST_A",
    "AUDIO_VOICE_HOST_B",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRO_MONTHLY_PRICE_ID",
    "STRIPE_PRO_YEARLY_PRICE_ID",
    "RESEND_API_KEY",
    "AUTH_RESEND_FROM"
  ],
  "optional": [
    "SEMANTIC_SCHOLAR_API_KEY",
    "PUBMED_EMAIL",
    "CORS_EXTRA_ORIGINS",
    "AUDIO_TTS_MODEL"
  ]
}
```

- [ ] **Step 2: Write the failing tests**

`scripts/lib/envDrift.test.mjs`:

```js
import { describe, expect, it } from "bun:test";
import { diffEnv, parseConvexEnvList } from "./envDrift.mjs";

describe("parseConvexEnvList", () => {
  it("extracts KEY names from `convex env list` output", () => {
    const stdout = [
      "FOO=bar",
      "LONG_KEY=some value with spaces",
      "EMPTY=",
      "",
      "not a line",
    ].join("\n");
    const keys = parseConvexEnvList(stdout);
    expect([...keys].sort()).toEqual(["EMPTY", "FOO", "LONG_KEY"]);
  });
});

describe("diffEnv", () => {
  it("reports required keys that are absent", () => {
    const present = new Set(["FOO", "BAR"]);
    const res = diffEnv(["FOO", "BAR", "BAZ"], present);
    expect(res.ok).toBe(false);
    expect(res.missing).toEqual(["BAZ"]);
  });

  it("is ok when every required key is present", () => {
    const present = new Set(["FOO", "BAR", "EXTRA"]);
    const res = diffEnv(["FOO", "BAR"], present);
    expect(res.ok).toBe(true);
    expect(res.missing).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests — verify they fail**

Run: `bun test scripts/lib/envDrift.test.mjs`
Expected: FAIL — `Cannot find module './envDrift.mjs'`.

- [ ] **Step 4: Implement `scripts/lib/envDrift.mjs`**

```js
/** Parse the stdout of `convex env list [--prod]` into a Set of variable names. */
export function parseConvexEnvList(stdout) {
  const keys = new Set();
  for (const line of String(stdout).split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (m) keys.add(m[1]);
  }
  return keys;
}

/** @returns {{ok: boolean, missing: string[]}} */
export function diffEnv(requiredKeys, presentKeys) {
  const missing = requiredKeys.filter((k) => !presentKeys.has(k));
  return { ok: missing.length === 0, missing };
}
```

- [ ] **Step 5: Run the tests — verify they pass**

Run: `bun test scripts/lib/envDrift.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 6: Add package scripts**

In `package.json` `scripts`, add:

```json
    "test:scripts": "bun test scripts/",
    "check:env-drift": "node scripts/check-convex-env-drift.mjs"
```

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/envDrift.mjs scripts/lib/envDrift.test.mjs scripts/convex-required-env.json package.json
git commit -m "feat: env-drift parser + differ with tests"
```

### Task 18: Env-drift CLI wrapper + workflow

**Files:**
- Create: `scripts/check-convex-env-drift.mjs`
- Create: `.github/workflows/env-drift.yml`

- [ ] **Step 1: Write the CLI wrapper**

`scripts/check-convex-env-drift.mjs`:

```js
#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { diffEnv, parseConvexEnvList } from "./lib/envDrift.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const { required, optional } = JSON.parse(
  readFileSync(join(here, "convex-required-env.json"), "utf8")
);

let stdout;
try {
  stdout = execFileSync("bunx", ["convex", "env", "list", "--prod"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
} catch (err) {
  console.error("Failed to run `bunx convex env list --prod`.");
  console.error("Ensure CONVEX_DEPLOY_KEY (production) is set in the environment.");
  process.exit(2);
}

const present = parseConvexEnvList(stdout);
const { ok, missing } = diffEnv(required, present);
const missingOptional = optional.filter((k) => !present.has(k));

if (missingOptional.length) {
  console.warn(`Optional keys not set in prod: ${missingOptional.join(", ")}`);
}

if (!ok) {
  console.error(`\nMISSING required prod env keys:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}

console.log(`OK — all ${required.length} required prod env keys are present.`);
```

- [ ] **Step 2: Smoke-test locally against dev**

Run: `bunx convex env list` (dev) to confirm the output format matches the `KEY=value` regex in `parseConvexEnvList`. If the CLI prints a table or different shape, adjust the regex in `scripts/lib/envDrift.mjs` and its test, re-run `bun test scripts/lib/envDrift.test.mjs`.

- [ ] **Step 3: Write the scheduled workflow**

`.github/workflows/env-drift.yml`:

```yaml
name: Convex env drift

on:
  schedule:
    - cron: "17 8 * * 1" # Mondays 08:17 UTC
  workflow_dispatch:

jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - name: Setup
        uses: ./.github/actions/setup

      - name: Check prod env drift
        env:
          CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_DEPLOY_KEY_PROD }}
        run: bun run check:env-drift
```

- [ ] **Step 4: [OPERATOR] Add the deploy-key secret**

In GitHub → Settings → Secrets and variables → Actions, add `CONVEX_DEPLOY_KEY_PROD` = a Convex **production** deploy key.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-convex-env-drift.mjs .github/workflows/env-drift.yml
git commit -m "ci: weekly Convex production env-drift check"
```

### Task 19: Rollback runbook

**Files:**
- Create: `docs/runbooks/rollback.md`
- Modify: `README.md`

- [ ] **Step 1: Write `docs/runbooks/rollback.md`**

```markdown
# Rollback Runbook

Use when a production deploy is bad (smoke check red, Sentry spike, user reports).
There is no canary/gradual rollout — a bad deploy is live for 100% of users until
reverted, so act first, diagnose second.

## Decide which layer is broken

| Symptom | Likely layer |
|---|---|
| White screen, JS console errors, 404 on assets | Frontend (Vercel) |
| Page loads, API calls 500, `/api/health` red | Backend (Convex) |
| Both | Convex (frontend usually degrades gracefully) |

Check: the `Deploy smoke check` run on the commit, Vercel deployment logs,
Convex logs (dashboard → Logs, or the Axiom dataset — see observability.md),
Sentry issues (web + Convex projects).

## Frontend rollback (Vercel)

1. Vercel dashboard → Project → Deployments.
2. Find the last deployment whose smoke check was green.
3. `⋯` → **Instant Rollback** (aliases production to that build; no rebuild).
4. Confirm `https://www.solomindlm.com` and `/api/health` respond.

CLI alternative (if the Vercel CLI is installed): `vercel rollback <deployment-url>`.

## Backend rollback (Convex)

Convex has no one-click rollback — you redeploy known-good code:

1. `git checkout <last-good-sha>`
2. `CONVEX_DEPLOY_KEY=<prod key> bunx convex deploy`
   (or run it via a fresh Vercel production deploy of that SHA).
3. Confirm `/api/health` and a real query.

### If the bad change was a schema change

Rolling back code may fail schema validation against rows written by the bad
version. Do **not** force it. Follow `superpowers:convex-migration-helper`
(widen → migrate → narrow): deploy a schema that accepts both old and new shapes,
backfill/clean the bad rows, then narrow. Escalate rather than guessing.

## Comms

- Post in the deploy channel (the `DEPLOY_WEBHOOK_URL` target): what broke, which
  layer, rolled-back-to SHA, current status.
- Open a follow-up issue with the root cause before re-attempting the deploy.

## After rollback

- Re-run `Deploy smoke check` (re-trigger by redeploying) and confirm green.
- Verify the uptime monitor is green.
- Do not re-merge the reverted change until the root cause is fixed and covered
  by a test or eval.
```

- [ ] **Step 2: Link from `README.md`**

In the `## Deployment` section of `README.md`, after the "Manual Deployment" block, add:

```markdown
### Rollback

If a production deploy is bad, follow [`docs/runbooks/rollback.md`](docs/runbooks/rollback.md).
```

- [ ] **Step 3: Commit**

```bash
git add docs/runbooks/rollback.md README.md
git commit -m "docs: add rollback runbook"
```

### Task 20: Open the Phase 3 PR and verify

- [ ] **Step 1: Push and open the PR**

```bash
git push -u origin ci/phase-3-deployment-safety
gh pr create --fill --base main --title "ci: Phase 3 — deployment safety (preview E2E, smoke check, env drift, rollback runbook)"
```

- [ ] **Step 2: Verify on the PR run**

- `gh pr checks --watch` — required checks green; `Lint (Workflows)` passes the three new workflow files.
- Run: `bun test scripts/` — expected PASS.
- Run: `bun run typecheck:convex` and `bun run typecheck:web` — expected PASS.

- [ ] **Step 3: Verify the deployment-triggered workflows on the PR's Vercel preview**

Once Vercel posts a successful Preview `deployment_status` for the PR:
- `Deploy smoke check` runs and passes (root marker + `/api/health`).
- `E2E (preview)` runs both shards against the preview `target_url`.
- To test the failure path: in a throwaway commit, change the Step 1 grep marker in `deploy-smoke.yml` to a string not on the page; confirm the check goes red; revert.

- [ ] **Step 4: [OPERATOR] Manually run env-drift once**

`gh workflow run "Convex env drift"` → confirm it completes and prints `OK — all N required prod env keys are present` (or a real drift list to reconcile).

- [ ] **Step 5: Merge** (squash).

---

## PHASE 3.5 — Observability

Branch: `ci/phase-3.5-observability` off `main` (after Phase 3 merges).

### Task 21: Browser error tracking with Sentry

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/sentry.ts`
- Modify: `apps/web/src/index.tsx`
- Modify: `.env.example`

- [ ] **Step 1: Add the dependency**

Run: `cd apps/web && bun add @sentry/react && cd ../..`
Then verify the root lockfile updated: `git status bun.lock`.

- [ ] **Step 2: Create `apps/web/src/sentry.ts`**

```ts
import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA as string | undefined,
    tracesSampleRate: 0.1,
    // Drop noise that isn't actionable.
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications.",
      /^AbortError/,
      /Non-Error promise rejection captured/,
    ],
  });
}

export { Sentry };
```

- [ ] **Step 3: Wire it into `apps/web/src/index.tsx`**

Make `./sentry` the **first** import (so init runs before other module side effects) and wrap the tree in a Sentry error boundary:

```tsx
import "./sentry";
import { Sentry } from "./sentry";
import { ConvexReactClient } from "convex/react";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ShellAwareConvexAuthProvider } from "./features/auth/components/ShellAwareConvexAuthProvider";
import "streamdown/styles.css";
import "./index.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL;
if (!convexUrl) throw new Error("VITE_CONVEX_URL is required");

const convex = new ConvexReactClient(convexUrl);

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Could not find root element");

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<p>Something went wrong. Please reload.</p>}>
      <ShellAwareConvexAuthProvider client={convex}>
        <App />
      </ShellAwareConvexAuthProvider>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
```

- [ ] **Step 4: Document the env var**

In `.env.example`, under a new `# ============================================\n# OBSERVABILITY (web build — Vite)\n# ============================================` block near the VITE section (or at the end), add:

```bash
# Sentry DSN for the web app (safe to expose; set in Vercel Production + Preview)
# VITE_SENTRY_DSN=
```

- [ ] **Step 5: [OPERATOR] Create the Sentry project + set the DSN**

In the existing Sentry org (the one mobile uses), create a new **web** project (platform: React). Copy its DSN into Vercel → Environment Variables → `VITE_SENTRY_DSN` for **Production** and **Preview**. Also set `VITE_VERCEL_GIT_COMMIT_SHA` is provided automatically by Vercel as `VERCEL_GIT_COMMIT_SHA`; expose it to the build as `VITE_VERCEL_GIT_COMMIT_SHA` by adding it in Vercel env (value: `$VERCEL_GIT_COMMIT_SHA`) or skip release tagging.

- [ ] **Step 6: Verify build + typecheck**

Run: `bun run typecheck:web`
Expected: PASS.
Run: `bun run build:prod`
Expected: build succeeds (Sentry init is a no-op without a DSN).

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json apps/web/src/sentry.ts apps/web/src/index.tsx .env.example bun.lock
git commit -m "feat(web): Sentry error tracking guarded by VITE_SENTRY_DSN"
```

### Task 22: Convex error capture

**Files:**
- Create: `convex/_lib/observability/errorCapture.ts`
- Modify: `convex/_lib/serviceErrors.ts`

Primary path is **Convex Sentinel** (Convex-native, no external runtime dependency). If the Task 12 spike selected Sentry for Convex instead, use the Alternative in Step 2b.

- [ ] **Step 1: Read the current error mapper**

Run: `cat convex/_lib/serviceErrors.ts`
Identify the `toConvexError` function and where unexpected (non-domain) errors are handled.

- [ ] **Step 2a: Primary — Convex Sentinel**

Invoke `superpowers:convex-sentinel` and follow it to install Sentinel into this deployment. Then create `convex/_lib/observability/errorCapture.ts` exporting a thin wrapper so call sites don't import Sentinel directly:

```ts
import { captureError as sentinelCapture } from "../../sentinel"; // path per the skill's install

/** Report an unexpected error to Sentinel. Never throws. */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  try {
    sentinelCapture(err instanceof Error ? err : new Error(String(err)), context);
  } catch {
    // observability must never break the request
  }
}
```

- [ ] **Step 2b: Alternative — Sentry via HTTP (only if spike said Sentry)**

```ts
const dsn = process.env.SENTRY_DSN;
// Parse "https://<key>@<host>/<projectId>" into the ingest URL once.
const endpoint = (() => {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace("/", "");
    return { url: `https://${u.host}/api/${projectId}/store/`, key: u.username };
  } catch {
    return null;
  }
})();

/** Best-effort fire-and-forget error report. Never throws. */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!endpoint) return;
  const e = err instanceof Error ? err : new Error(String(err));
  const body = JSON.stringify({
    platform: "node",
    environment: process.env.CONVEX_CLOUD_URL?.includes("dev") ? "development" : "production",
    exception: { values: [{ type: e.name, value: e.message, stacktrace: { frames: [] } }] },
    extra: context ?? {},
    timestamp: Date.now() / 1000,
  });
  void fetch(endpoint.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${endpoint.key}, sentry_client=solomind-convex/1.0`,
    },
    body,
  }).catch(() => {});
}
```

- [ ] **Step 3: Call it from `toConvexError`**

In `convex/_lib/serviceErrors.ts`, import `captureException` and call it in the branch that handles unexpected/unknown errors (not for expected domain errors like `InputValidationError` — those are user-facing and not bugs). Example shape (adapt to the real function body):

```ts
import { captureException } from "./observability/errorCapture";

// inside toConvexError, in the "unknown error" branch, before returning the ConvexError:
captureException(err, { source: "toConvexError" });
```

- [ ] **Step 4: [OPERATOR] Set `SENTRY_DSN` (alternative path only)**

If Step 2b was used: `bunx convex env set SENTRY_DSN "<convex-sentry-project-dsn>" --prod` and add `SENTRY_DSN` to `scripts/convex-required-env.json` `required`, plus `.env.example`.

- [ ] **Step 5: Verify**

Run: `bun run typecheck:convex`
Expected: PASS.
Run: `bun run test:convex`
Expected: PASS (the capture wrapper is guarded and never throws; existing error tests still pass).

- [ ] **Step 6: Commit**

```bash
git add convex/_lib/observability/errorCapture.ts convex/_lib/serviceErrors.ts
git commit -m "feat(convex): capture unexpected errors to Sentinel"
```

### Task 23: Deploy notification webhook

**Files:**
- Modify: `.github/workflows/deploy-smoke.yml`
- Modify: `.github/workflows/e2e-preview.yml`

- [ ] **Step 1: Add a notify step to `deploy-smoke.yml`**

Append to the `smoke` job:

```yaml
      - name: Notify deploy channel
        if: >
          always() &&
          (env.ENVIRONMENT == 'Production' || job.status == 'failure') &&
          env.DEPLOY_WEBHOOK_URL != ''
        env:
          DEPLOY_WEBHOOK_URL: ${{ secrets.DEPLOY_WEBHOOK_URL }}
        run: |
          status='${{ job.status }}'
          curl -fsS -X POST "$DEPLOY_WEBHOOK_URL" \
            -H 'Content-Type: application/json' \
            -d "$(printf '{"text":"Deploy smoke [%s] %s — %s (%s)"}' \
                  "$ENVIRONMENT" "$status" "$TARGET_URL" "${{ github.sha }}")"
```

- [ ] **Step 2: Add a failure-only notify to `e2e-preview.yml`**

Append to the `e2e` job:

```yaml
      - name: Notify on E2E failure
        if: failure() && env.DEPLOY_WEBHOOK_URL != ''
        env:
          DEPLOY_WEBHOOK_URL: ${{ secrets.DEPLOY_WEBHOOK_URL }}
        run: |
          curl -fsS -X POST "$DEPLOY_WEBHOOK_URL" \
            -H 'Content-Type: application/json' \
            -d "$(printf '{"text":"E2E preview FAILED shard %s — %s"}' \
                  "${{ matrix.shard }}" "${{ github.event.deployment_status.target_url }}")"
```

- [ ] **Step 3: [OPERATOR] Add the webhook secret**

Create a Slack or Discord incoming webhook; add it as GitHub Actions secret `DEPLOY_WEBHOOK_URL`. (Discord webhooks need `/slack` appended to accept the `{"text": ...}` shape, or adjust the payload to `{"content": ...}`.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy-smoke.yml .github/workflows/e2e-preview.yml
git commit -m "ci: post deploy smoke + E2E results to the deploy webhook"
```

### Task 24: Observability runbook + operator setup

**Files:**
- Create: `docs/runbooks/observability.md`
- Modify: `README.md`

- [ ] **Step 1: [OPERATOR] Configure the Convex Log Stream → Axiom**

Convex dashboard → the **production** deployment → Settings → Integrations → Log Streams → add Axiom (free-tier account, create a dataset e.g. `solomind-prod`). Confirm events arrive in Axiom within a few minutes.

- [ ] **Step 2: [OPERATOR] Stand up the uptime monitor**

In BetterStack or Checkly (free tier): two HTTP monitors —
`https://www.solomindlm.com/` and `https://www.solomindlm.com/api/health` — interval 1–5 min, alert to email + (optionally) the `DEPLOY_WEBHOOK_URL` channel. Record the monitor URLs.

- [ ] **Step 3: Write `docs/runbooks/observability.md`**

```markdown
# Observability

## Error tracking
- **Web:** Sentry project `<name>` — https://sentry.io/organizations/<org>/projects/<web>/
  DSN in Vercel env `VITE_SENTRY_DSN` (Production + Preview). Releases tagged with
  the Vercel commit SHA. Sample rate 10%.
- **Convex:** <Sentinel dashboard link> (or Sentry Convex project `<name>` if that
  path was chosen). Fed from `convex/_lib/observability/errorCapture.ts` via
  `toConvexError`.

## Logs
- Production Convex logs stream to Axiom dataset `<dataset>`.
  `serviceLogger` emits one JSON object per line with `requestId`; join to
  Convex `function.request_id`.
- Starter queries:
  - Errors in the last hour: `<dataset> | where level == "error" | sort by _time desc`
  - By requestId: `<dataset> | where requestId == "<id>"`

## Uptime
- <BetterStack/Checkly> monitors: `/` and `/api/health`, 1–5 min, alert → email + deploy channel.
- Monitor URLs: <...>

## Deploy notifications
- GitHub Actions secret `DEPLOY_WEBHOOK_URL` → <Slack/Discord channel>.
- `Deploy smoke check` posts on every production deploy and on any failure.
- `E2E (preview)` posts on failure only.

## Where to look when prod is broken
1. Deploy smoke check run on the commit (GitHub Actions).
2. Sentry issues (web + Convex).
3. Axiom dataset (recent errors, then filter by requestId).
4. Vercel deploy + function logs.
5. Then follow docs/runbooks/rollback.md.
```

Fill every `<...>` from Steps 1–2 and Task 21/22.

- [ ] **Step 4: Link from `README.md`**

Under `## Observability` in `README.md` (or create the section), add:
`See [`docs/runbooks/observability.md`](docs/runbooks/observability.md) for error tracking, logs, uptime, and deploy notifications.`

- [ ] **Step 5: Commit**

```bash
git add docs/runbooks/observability.md README.md
git commit -m "docs: observability runbook (Sentry, Axiom, uptime, deploy webhook)"
```

### Task 25: Open the Phase 3.5 PR and verify

- [ ] **Step 1: Push + PR**

```bash
git push -u origin ci/phase-3.5-observability
gh pr create --fill --base main --title "feat: Phase 3.5 — observability (Sentry, Convex capture, Axiom, uptime, deploy webhook)"
```

- [ ] **Step 2: Verify**

- `gh pr checks --watch` — required checks green.
- On the PR's Vercel preview: throw a test error in a route (temporary commit) → confirm it lands in the Sentry **web** project with `environment=preview` (or production build's `MODE`). Revert.
- Trigger a Convex action error path in dev → confirm capture in Sentinel/Sentry.
- Confirm a webhook message posts for the preview deploy's smoke check (failure path) — or force one.

- [ ] **Step 3: Merge** (squash).

---

## PHASE 4 — Hardening

Branch: `ci/phase-4-hardening` off `main` (after Phase 2 merges; independent of 3 / 3.5).

### Task 26: Renovate config

**Files:**
- Create: `renovate.json`

- [ ] **Step 1: Write `renovate.json`**

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": [
    "config:recommended",
    "helpers:pinGitHubActionDigests",
    ":dependencyDashboard",
    ":semanticCommits"
  ],
  "timezone": "America/Toronto",
  "schedule": ["before 9am on monday"],
  "lockFileMaintenance": { "enabled": true, "schedule": ["before 9am on monday"] },
  "rangeStrategy": "bump",
  "labels": ["dependencies"],
  "packageRules": [
    {
      "groupName": "Convex",
      "matchPackageNames": ["convex", "convex-helpers", "convex-test"],
      "matchPackagePrefixes": ["@convex-dev/"]
    },
    {
      "groupName": "LangChain",
      "matchPackagePrefixes": ["@langchain/"],
      "matchPackageNames": ["langsmith"]
    },
    {
      "groupName": "dev tooling",
      "matchPackageNames": ["typescript", "vitest", "@playwright/test"],
      "matchPackagePrefixes": ["@biomejs/", "@types/", "@typescript/", "@vitest/"]
    },
    {
      "matchPackageNames": ["react", "react-dom"],
      "enabled": false,
      "description": "Pinned via root package.json overrides; bump manually with the app."
    }
  ],
  "vulnerabilityAlerts": { "labels": ["security"], "schedule": ["at any time"] }
}
```

- [ ] **Step 2: Validate the config**

Run: `bunx --bun renovate-config-validator renovate.json`
Expected: `Config validated successfully`.

- [ ] **Step 3: Commit**

```bash
git add renovate.json
git commit -m "ci: add Renovate config (grouped weekly updates, action digest pinning)"
```

- [ ] **Step 4: [OPERATOR] Enable the Renovate GitHub App**

Install the Renovate app (https://github.com/apps/renovate) on this repo. Merge the onboarding PR it opens. Confirm the Dependency Dashboard issue appears.

### Task 27: CodeQL workflow

**Files:**
- Create: `.github/workflows/codeql.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: CodeQL

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: "23 6 * * 1"

jobs:
  analyze:
    name: Analyze (javascript-typescript)
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      actions: read
      contents: read
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: javascript-typescript
          config: |
            paths-ignore:
              - convex/_generated
              - .worktrees
              - apps/mobile
              - docs
              - "**/*.test.ts"
              - "**/*.test.tsx"

      - name: Autobuild
        uses: github/codeql-action/autobuild@v3

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/codeql.yml
git commit -m "ci: add CodeQL JS/TS analysis"
```

### Task 28: `bun audit` step + CODEOWNERS

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `.github/CODEOWNERS`

- [ ] **Step 1: Add a non-blocking `bun audit` step to the `lint` job**

In `.github/workflows/ci.yml`, in the `lint` job after `Biome check`:

```yaml
      - name: Dependency audit (baseline — non-blocking)
        continue-on-error: true
        run: bun audit --audit-level=high
```

- [ ] **Step 2: Create `.github/CODEOWNERS`**

```
# Default owner
*                       @samintisar

# Auth, schema, HTTP surface — review carefully
/convex/auth.ts         @samintisar
/convex/schema.ts       @samintisar
/convex/http.ts         @samintisar
/convex/_lib/           @samintisar

# Deploy + CI config
/apps/web/vercel.json   @samintisar
/.github/               @samintisar
/renovate.json          @samintisar
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml .github/CODEOWNERS
git commit -m "ci: baseline bun audit + CODEOWNERS"
```

### Task 29: Coverage floor

**Files:**
- Modify: `apps/web/vitest.config.ts`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Measure current coverage**

Run: `bun run test:web:coverage`
Record the four summary numbers (statements / branches / functions / lines %) from the printed table.

- [ ] **Step 2: Add thresholds to `apps/web/vitest.config.ts`**

Inside the `test: { ... }` object, add (using the **measured** numbers from Step 1, rounded **down** to the nearest whole percent):

```ts
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Floor = current measured coverage rounded down. Ratchet up over time.
      thresholds: {
        statements: <measured>,
        branches: <measured>,
        functions: <measured>,
        lines: <measured>,
      },
    },
```

- [ ] **Step 3: Run coverage again to confirm it passes the floor**

Run: `bun run test:web:coverage`
Expected: PASS (exit 0) — thresholds equal current coverage.

- [ ] **Step 4: Run `test-coverage` on PRs too**

In `.github/workflows/ci.yml`, change the `test-coverage` job:
- Remove `if: github.ref == 'refs/heads/main'` (so it runs on PRs and pushes).
- Its `Generate Coverage` step now enforces the floor and fails the job if coverage drops.

- [ ] **Step 5: Commit**

```bash
git add apps/web/vitest.config.ts .github/workflows/ci.yml
git commit -m "ci: enforce a web coverage floor on PRs"
```

### Task 30: Open the Phase 4 PR and verify

- [ ] **Step 1: Push + PR**

```bash
git push -u origin ci/phase-4-hardening
gh pr create --fill --base main --title "ci: Phase 4 — hardening (Renovate, CodeQL, bun audit, CODEOWNERS, coverage floor)"
```

- [ ] **Step 2: Verify**

- `gh pr checks --watch` — required checks green; new `CodeQL` check runs and completes; `Coverage Report` runs on the PR and passes the floor; the `bun audit` step runs and prints advisories without failing the job.
- `bunx --bun renovate-config-validator renovate.json` — `Config validated successfully`.
- After merge + enabling the app: Renovate opens the onboarding PR and a Dependency Dashboard issue.
- Open a trivial PR touching `convex/schema.ts` and confirm GitHub requests review per `CODEOWNERS`.

- [ ] **Step 3: Merge** (squash).

- [ ] **Step 4: [OPERATOR] Add `bun audit` and CodeQL to required checks (optional, later)**

Once the `bun audit` baseline is triaged, flip `continue-on-error` to `false` in a follow-up and add `CodeQL` + `Coverage Report` to `.github/branch-protection.ps1`, then re-run it.

---

## Self-Review

**Spec coverage** — every spec section maps to tasks:
- §Phase 1 → Tasks 1–6 (web typecheck, actionlint, loud E2E, branch protection, docs).
- §Phase 2 → Tasks 7–11 (composite action, adoption, Playwright cache, de-serialize, Tavily investigation).
- §Phase 3 → Tasks 12–20 (spike, preview wiring + guard [conditional], preview E2E, smoke check, env-drift lib/CLI/workflow, rollback runbook).
- §Phase 3.5 → Tasks 21–25 (web Sentry, Convex capture, deploy webhook, observability runbook + operator setup).
- §Phase 4 → Tasks 26–30 (Renovate, CodeQL, bun audit, CODEOWNERS, coverage floor).
- §Cross-cutting: Node/Bun single-sourcing → Task 7 (`bun-version-file`); guard-test coupling → Task 14; secrets inventory → Tasks 4/18/23 operator steps.
- §Non-goals: no tasks for rolling releases, staging, mobile, `vercel.ts`, or the deploy model — correct.

**Placeholder scan** — the `<measured>` / `<fill>` / `<...>` markers in Tasks 12, 17, 22, 24, 29 are deliberate operator-supplied values (dashboard facts, measured numbers), each with an explicit instruction on how to obtain them, not deferred work. No "add error handling" / "similar to Task N" / bare TODO instances.

**Type / name consistency** — `parseConvexEnvList` and `diffEnv` signatures match between `envDrift.test.mjs` (Task 17 Step 2), `envDrift.mjs` (Task 17 Step 4), and the CLI wrapper (Task 18 Step 1). `captureException(err, context?)` signature matches between both implementation variants (Task 22 Step 2a/2b) and the call site (Task 22 Step 3). Job names used in branch protection (Task 4) — `Typecheck (Web)`, `Lint (Workflows)`, `Unit Tests`, `Build (Web, PR parity)` — match the `name:` values set in Tasks 1, 2 and the existing `ci.yml`. Composite action path `./.github/actions/setup` is consistent across Tasks 8, 18, and referenced (with rationale for not using it) in Task 15.

**Conditional tasks** — Tasks 13 and 14 execute only if Task 12's spike returns VIABLE; both say so in their titles. Task 15 Step 4 and Task 22 branch on the same spike outcome. This is inherent to the spec's design (§3.0 decision branches), not an unresolved gap.
