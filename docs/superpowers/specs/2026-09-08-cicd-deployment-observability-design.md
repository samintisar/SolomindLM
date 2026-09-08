# CI/CD Pipeline, Deployment Safety & Observability — Design

**Date:** 2026-09-08
**Status:** Approved (design), pending spec review
**Owner:** @samintisar

## Summary

Harden the CI/CD pipeline and add post-deploy safety and observability for the
web + Convex surfaces. The work is split into five sequenced phases, each landing
as its own PR, ordered by risk and dependency. Mobile (`apps/mobile`) is out of
scope for this effort.

## Problem statement

The current pipeline has correctness holes, no build caching, and no visibility
into whether a deploy actually works:

1. **No web typecheck in CI.** `.github/workflows/ci.yml` runs `typecheck:convex`
   and `typecheck:mobile`, but `apps/web` `build` is `vite build && …` with no
   `tsc`/`tsgo` step. Web type errors reach `main` undetected. `CONTRIBUTING.md`
   and `BRANCHING.md` both claim CI runs this.
2. **Branch protection is misconfigured.** `.github/branch-protection.ps1`
   requires status checks named `Type Check (API)`, `Build (Web)`, `Build (API)` —
   none of which match real job names. Required checks are unenforced or blocking
   on non-existent jobs.
3. **E2E in CI tests nothing real.** `playwright.config.ts` silently ignores all
   spec files when `E2E_TEST_*` repo secrets are absent (0 tests, exit 0). If the
   secrets *were* set, the `test-e2e` job would fail because it never starts a web
   or Convex server and never sets `PLAYWRIGHT_BASE_URL`.
4. **No dependency caching.** All ~7 jobs run `bun install --frozen-lockfile`
   cold. Setup boilerplate is copy-pasted into every job.
5. **No deployment safety net.** A green build does not confirm the app serves.
   No post-deploy smoke check, no documented rollback procedure, no env-var drift
   detection between `.env` and the Convex production deployment.
6. **No observability for web + Convex.** Only `convex/_lib/logging/serviceLogger.ts`
   (JSON lines to the Convex dashboard, limited history). No error tracking, no
   log retention, no uptime monitoring, no deploy notifications. (Mobile already
   uses `@sentry/react-native`; web and Convex have nothing.)
7. **No dependency-update automation, security scanning, or `CODEOWNERS`.**

## Goals

- Web type errors block merge to `main`.
- Branch protection references real, enforced status checks.
- E2E in CI exercises a real deployed environment or fails loudly.
- CI reruns are meaningfully faster via dependency + browser caching, with setup
  logic defined once.
- Every production deploy is smoke-checked; a failed check is visible on the commit.
- A written rollback runbook exists and is linked from the README.
- Env-var drift between the documented key set and Convex production is detected
  on a schedule.
- Runtime errors in web and Convex are captured with alerting; production logs are
  retained beyond the Convex dashboard window; the site has an external uptime check.
- Dependency updates arrive as reviewable grouped PRs; basic security scanning runs
  in CI; sensitive paths have owners.

## Non-goals / out of scope

- **Rolling releases / canary deployments** — deferred; low real-user count.
- **Staging environment** (separate long-lived Convex + Vercel target) — deferred;
  rely on PR previews + fast rollback.
- **Mobile app** — no new mobile CI, deployment, or observability work. Existing
  `typecheck-mobile` CI job and mobile Sentry integration are left untouched.
- **`vercel.json` → `vercel.ts` migration** — the current file works; this is a
  Vite app rooted at `apps/web`, not Next.js.
- **Changing the "Vercel runs `convex deploy`" model** — it is correct and
  deliberately avoids the Convex 409 `ExistingModuleHashConflict` race with CI.
- **Dedicated secret manager** (Doppler/Infisical) — the env-drift check covers the
  main risk for a solo project.
- **Feature-flag service** — tied to rolling releases, which are out of scope.

## Current state (reference)

**`.github/workflows/ci.yml`** — triggers on push to `main` and PRs to `main`;
`concurrency` group with `cancel-in-progress`; `NODE_OPTIONS=--max-old-space-size=4096`.
Jobs:

| Job | Name | Runs on | Notes |
|---|---|---|---|
| `typecheck-convex` | `Typecheck (Convex)` | PR + push | Also asserts `apps/web/vercel.json` contains `convex deploy`, `VERCEL_ENV`, `preview` |
| `lint` | `Lint (Biome)` | PR + push | `bun run lint -- --diagnostic-level=error` |
| `test-unit` | `Unit Tests` | PR + push | `needs: [lint]`; `test:convex` + `test:web` + `eval:rag:dry`; real `TAVILY_API_KEY` secret, fake `TOGETHER_AI_API_KEY` |
| `test-coverage` | `Coverage Report` | push to `main` only | uploads `apps/web/coverage/` artifact |
| `typecheck-mobile` | `Typecheck (Expo mobile)` | PR + push | out of scope for changes |
| `build-web` | `Build (Web, PR parity)` | PR only | `needs: [typecheck-convex, typecheck-mobile]`; placeholder `VITE_CONVEX_URL` |
| `build-web-main` | `Build web (main, prod Convex URL — no deploy)` | push to `main` | needs repo var `VITE_CONVEX_URL`; fails if unset |
| `test-e2e` | `E2E Tests (n/2)` | PR only | 2 shards; installs Chromium; passes `E2E_TEST_*` secrets; **starts no server** |

Every job: `actions/checkout@v4` → `oven-sh/setup-bun@v1` (`bun-version: "1.2.2"`) →
`bun install --frozen-lockfile`. No caching.

**`apps/web/vercel.json`** — `buildCommand` branches on `$VERCEL_ENV`:
`preview` → `bun run build:prod`; otherwise →
`bun x convex deploy --cmd "bun run build:prod" --cmd-url-env-var-name VITE_CONVEX_URL`.
Also: monorepo `installCommand` from repo root, `/api/*` → Convex proxy, SPA
fallback, security headers, apex→www redirect.

**`playwright.config.ts`** (repo root) — `testDir: ./e2e`,
`globalSetup: ./e2e/global-setup.ts`, `baseURL: PLAYWRIGHT_BASE_URL || "http://localhost:5173"`,
no `webServer`. `skipE2EInCI = CI && !hasE2ECreds` → `testIgnore: "**/*.ts"`
(silent no-op) and `globalSetup` disabled.

**`convex/http.ts`** — a `GET /health` route already exists (line ~90). No new
health endpoint is needed.

**`package.json`** — `packageManager: "bun@1.2.2"`, `engines.node >=20.0.0`,
`engines.bun >=1.2.2`. Relevant scripts: `typecheck:web`, `typecheck:convex`,
`typecheck:mobile`, `lint`, `test:convex`, `test:web`, `test:web:coverage`,
`test:e2e`, `eval:rag:dry`, `convex:env:pull:*`, `convex:env:push:*`.

**No** `renovate.json` / `.github/dependabot.yml`, **no** `.github/CODEOWNERS`,
**no** CodeQL workflow, **no** `bun audit` in CI.

---

## Design

### Rollout sequencing

```
Phase 1  CI correctness ........... independent, pure additions
Phase 2  CI performance .......... introduces composite action (Phases 3/3.5 reuse it)
Phase 3  Deployment safety ....... contains the Convex-preview spike (blocks 3.2)
Phase 3.5 Observability .......... spike outcome (Sentry vs Sentinel for Convex) feeds in
Phase 4  Hardening .............. independent; can land any time after Phase 2
```

Each phase is one PR (Phase 3 may be two: spike + implementation). Merge order is
1 → 2 → 3 → 3.5 → 4. Phase 4 has no hard dependency on 3/3.5 beyond the composite
action from Phase 2.

---

### Phase 1 — CI correctness

**PR scope:** `.github/workflows/ci.yml`, `.github/branch-protection.ps1`,
`.github/BRANCHING.md`, `CONTRIBUTING.md`, `playwright.config.ts` (interim guard),
new `.github/workflows/` lint via actionlint.

1. **Add `typecheck-web` job.**
   - Name: `Typecheck (Web)`. Structure mirrors `typecheck-convex` (minus the
     vercel.json assertion). Command: `bun run typecheck:web`.
   - Runs on PR + push (same as the other typecheck jobs).
   - Add `typecheck-web` to the `needs` array of `build-web` and `build-web-main`
     so a web type error fails fast before the build step.

2. **Fix `branch-protection.ps1`.**
   - Replace the `required_status_checks.checks` contexts with the real job names:
     `Typecheck (Convex)`, `Typecheck (Web)`, `Typecheck (Expo mobile)`,
     `Lint (Biome)`, `Unit Tests`, `Build (Web, PR parity)`.
   - Keep `strict = $true` (require branches up to date), `enforce_admins = $true`,
     `required_approving_review_count = 1`, `allow_force_pushes = $false`,
     `allow_deletions = $false`.
   - **Do not** add the E2E job as a required check in Phase 1 (it is a no-op until
     Phase 3). Add a comment in the script noting E2E becomes a deployment-gated
     advisory check in Phase 3.
   - Script still requires the operator to run it with `gh` CLI authenticated as a
     repo admin. Document this in the PR description and `BRANCHING.md`.

3. **Sync docs.** Update the CI job/check names referenced in
   `.github/BRANCHING.md` ("CI Pipeline Details", "Setting Up Branch Protection")
   and `CONTRIBUTING.md` ("Wait for CI to pass …") to match reality.

4. **Make the E2E skip loud (interim).**
   - Add a guard step at the top of the `test-e2e` job:
     `if [ -z "$E2E_TEST_EMAIL" ] || [ -z "$E2E_TEST_PASSWORD" ]; then echo "::error::E2E secrets missing — E2E is not running"; exit 1; fi`.
   - This makes the current gap visible on every PR run. The whole job is replaced
     in Phase 3; this step is throwaway but keeps the intermediate state honest.
   - Leave `playwright.config.ts`'s `skipE2EInCI` path in place for now (still used
     by anyone running `bunx playwright test` locally without creds); it is
     revisited in Phase 3.

5. **Add `actionlint`.**
   - New job `actionlint` (name `Workflow Lint`) using `raszi/actionlint` (or
     `docker://rhysd/actionlint`) to validate `.github/workflows/*.yml`.
   - Fast, no `bun install`. Add to branch-protection required checks in the same
     PR that updates the script.

**Verification:**
- Open a throwaway PR; confirm `Typecheck (Web)` and `Workflow Lint` appear and
  pass, and that `test-e2e` now fails with the explicit error (secrets unset) or
  is wired later in Phase 3.
- Locally: `bun run typecheck:web` exits 0 on current `main`.
- Operator runs `pwsh -File .github/branch-protection.ps1` and confirms the
  GitHub UI shows the new required checks.

---

### Phase 2 — CI performance

**PR scope:** new `.github/actions/setup/action.yml`, `.github/workflows/ci.yml`.

1. **Composite setup action** — `.github/actions/setup/action.yml`:
   - `actions/checkout` is kept per-job (composite actions can `uses: actions/checkout`
     but keeping it explicit in each job is clearer for `fetch-depth` tuning later).
     Decision: put checkout **inside** the composite to cut one line per job; no job
     currently needs a custom `fetch-depth`.
   - Steps: `actions/checkout@v4` → `oven-sh/setup-bun@v2` with
     `bun-version-file: package.json` (single-sources the Bun version from
     `packageManager`) → `actions/cache@v4` on `~/.bun/install/cache` with key
     `bun-${{ runner.os }}-${{ hashFiles('bun.lock') }}` and restore-key
     `bun-${{ runner.os }}-` → `bun install --frozen-lockfile`.
   - Every job replaces its checkout + setup-bun + install trio with
     `- uses: ./.github/actions/setup`.

2. **Playwright browser cache** (in the Phase 3 E2E job; noted here for the caching
   theme): `actions/cache@v4` on `~/.cache/ms-playwright` keyed on the Playwright
   version (`hashFiles('bun.lock')` is a coarse but acceptable key). Run
   `bunx playwright install --with-deps chromium` only on cache miss
   (`if: steps.pw-cache.outputs.cache-hit != 'true'`).

3. **De-serialize `test-unit`.** Remove `needs: [lint]`. Both remain required via
   branch protection; there is no reason to gate test feedback on lint.

4. **Action version bumps.** `oven-sh/setup-bun@v1` → `@v2` (done via the composite).
   Keep `actions/checkout@v4` and `actions/upload-artifact@v4` (current majors).

5. **Tavily secret decision.** Determine whether any code path exercised by
   `bun run test:convex` actually calls Tavily. If not, drop `TAVILY_API_KEY` from
   the `test-unit` env. If yes, either mock it or accept the dependency and
   document it. (Investigation step; outcome recorded in the PR.)

**Verification:**
- Run CI twice on a no-op PR; second run shows `Cache restored` for
  `~/.bun/install/cache` and a lower total wall-clock.
- All jobs still pass with the composite action.
- `test-unit` starts without waiting for `lint`.

---

### Phase 3 — Deployment safety

**PR scope (possibly two PRs):** spike doc, `apps/web/vercel.json`,
`.github/workflows/ci.yml` (guard test + E2E job), new
`.github/workflows/deploy-smoke.yml`, new `docs/runbooks/rollback.md`,
new `scripts/check-convex-env-drift.mjs`, new
`.github/workflows/env-drift.yml`, README link.

#### 3.0 Spike — Convex preview deployments (timeboxed, ~half day)

Investigate and record findings in
`docs/superpowers/specs/2026-09-08-cicd-deployment-observability-design.md`
(append a "Spike outcome" section) or a short sibling doc:

- Convex plan tier for this project (preview deployments require a paid plan).
- Whether a **preview deploy key** can be generated (Convex dashboard →
  Settings → Deploy keys → Preview).
- Rough incremental cost (preview deployments bill like a small dev deployment).
- Whether `convex deploy --preview-create` is available at the installed Convex
  version (`convex@1.42.3`).

**Decision branches:**

- **Viable → wire per-PR Convex backends:**
  - `apps/web/vercel.json` preview branch becomes:
    `bun x convex deploy --preview-create "$VERCEL_GIT_COMMIT_REF" --cmd "bun run build:prod" --cmd-url-env-var-name VITE_CONVEX_URL`
  - Set the preview deploy key as `CONVEX_DEPLOY_KEY` in the Vercel **Preview**
    environment scope only (production keeps the production deploy key).
  - **Update the `typecheck-convex` guard test** in `ci.yml`: it currently asserts
    the preview branch is build-only (`grep -qF 'preview'` + the comment about
    preview not running `convex deploy`). Rewrite the assertions to: (a) non-preview
    still runs `convex deploy` without `--preview-create`; (b) preview runs
    `convex deploy --preview-create`; (c) preview and production use different code
    paths. Keep the intent (preview must never touch prod Convex) but allow
    `--preview-create`.
- **Not viable → dedicated non-prod Convex for previews:**
  - Point the Vercel **Preview** `VITE_CONVEX_URL` / `VITE_CONVEX_SITE_URL` at a
    dedicated Convex **dev** deployment (not production, not a developer's personal
    dev deployment).
  - Add an assertion (script or CI step) that the Preview `VITE_CONVEX_URL` is not
    equal to the production URL (`vars.VITE_CONVEX_URL`).
  - `vercel.json` preview branch stays build-only; no guard-test change.

The spike outcome also decides the Convex error-tracking choice in Phase 3.5
(Sentry vs Convex Sentinel).

#### 3.1 E2E against the Vercel preview deployment

Replace the `test-e2e` job with a job triggered by Vercel's deployment status:

- Add `deployment_status` to the workflow `on:` triggers (or a dedicated
  `.github/workflows/e2e-preview.yml`).
- Job condition:
  `github.event.deployment_status.state == 'success' && github.event.deployment_status.environment == 'Preview'`.
- Steps: composite setup → Playwright browser cache + conditional install → run
  `bunx playwright test --shard=${{ matrix.shard }}/${{ matrix.total }}` (keep the
  2-shard matrix) with:
  - `PLAYWRIGHT_BASE_URL: ${{ github.event.deployment_status.target_url }}`
  - `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` from repo secrets
- Upload `playwright-report/` + `test-results/` on failure.
- `playwright.config.ts`: remove the `skipE2EInCI` silent-ignore branch. Keep the
  explicit `throw` in `e2e/global-setup.ts` when creds are missing (already
  present) so local misconfiguration fails loudly too.
- Branch protection: E2E stays **advisory** initially (deployment-gated checks are
  awkward to mark strictly required). Document the intent to promote it once it is
  proven stable.

**Open dependency:** the E2E test account must exist in whatever Convex backend
the preview points at (per-PR preview backend from 3.0-viable, or the shared
non-prod deployment from 3.0-not-viable). If per-PR: `global-setup.ts` may need a
sign-up step or a seeded account. Record the chosen approach in the spike outcome.

#### 3.2 Post-deploy smoke check

New workflow `.github/workflows/deploy-smoke.yml`:

- Trigger: `deployment_status`.
- Job condition:
  `github.event.deployment_status.state == 'success'` and
  `environment` is `Production` (add a second job or matrix entry for `Preview`
  if useful).
- Steps (no `bun install` needed — pure `curl`):
  1. `curl -fsS <target_url>` → assert HTTP 200 and grep the response for a known
     HTML marker (e.g. the app's root `<title>` or a `<div id="root">`).
  2. `curl -fsS <target_url>/api/health` — the `/api/*` route proxies to Convex
     `GET /health` (`convex/http.ts`). Assert 200 and expected JSON shape.
  3. On failure: `exit 1` (red check on the commit) and post to the deploy
     notification webhook (see Phase 3.5).
- `target_url` for production is the deployment URL from the event; the custom
  domain (`www.solomindlm.com`) can be checked additionally with a hardcoded URL.

#### 3.3 Rollback runbook

New `docs/runbooks/rollback.md`:

- **Frontend (Vercel):** Vercel dashboard → Deployments → previous good deployment
  → "Instant Rollback" (or `vercel rollback <url>` if the CLI is installed).
- **Backend (Convex):** `git checkout <good-sha>` then `bun x convex deploy` with
  the production deploy key, or use the Convex dashboard deployment history.
- **Ordering trap:** if a bad **schema** change shipped, rolling back the frontend
  alone will not help and rolling back Convex may fail validation against existing
  data — link to `superpowers:convex-migration-helper` and the widen-migrate-narrow
  rule.
- **Triage:** how to tell which layer is broken — smoke-check job output, Convex
  logs (dashboard / log stream), Vercel build & function logs, Sentry issues.
- **Comms:** who to notify, where (deploy webhook channel).
- Link from `README.md` "Deployment" section.

#### 3.4 Env-var drift check

- New `scripts/check-convex-env-drift.mjs`:
  - Read the canonical key list. **Open question:** `.env.example` is the closest
    artifact but appears partial (no `CONVEX_DEPLOY_KEY`, `STRIPE_*`, `RESEND_*`).
    Phase 3 task: define the canonical production key set — either complete
    `.env.example`, or add a dedicated `convex/env.required.json` consumed by both
    this script and `convex/_lib/env` helpers.
  - Run `npx convex env list --prod` (needs `CONVEX_DEPLOY_KEY`), parse key names.
  - Diff **names only** (never values). Exit non-zero listing any missing keys.
- New `.github/workflows/env-drift.yml`: `on: schedule` (weekly) +
  `workflow_dispatch`. Notify-only (failure surfaces in the Actions tab + optional
  webhook); not a PR gate.

**Verification (Phase 3):**
- Trigger a preview deploy from a PR; confirm the E2E and smoke jobs fire on
  `deployment_status` and pass.
- Temporarily break the smoke marker; confirm the check goes red on the commit
  and the webhook fires; revert.
- Run `node scripts/check-convex-env-drift.mjs` locally against dev; confirm it
  reports correctly when a key is removed.
- Confirm the `typecheck-convex` guard test passes with the updated `vercel.json`
  (if 3.0 went the "viable" route).

---

### Phase 3.5 — Observability

**PR scope:** `apps/web` Sentry wiring, Convex error-capture wiring, Axiom log
stream (dashboard config + doc), uptime monitor (doc + account), deploy
notification webhook step in the Phase 3 workflows, README/runbook updates.

1. **Error tracking — web.**
   - Add `@sentry/react` to `apps/web`. Initialize in the app entry with
     `VITE_SENTRY_DSN` (Vite env; safe to expose), `environment` from
     `import.meta.env.MODE` / a Vercel env var, `tracesSampleRate` low
     (e.g. 0.1), release tagged with the Vercel git SHA.
   - Wrap the router error boundary; filter known noise (network abort, extension
     errors).
   - Add `VITE_SENTRY_DSN` to Vercel (Production + Preview) and `.env.example`.
   - Reuse the existing Sentry org/project family (mobile already uses Sentry) — a
     new **web** project within the same org. (Mobile config itself is untouched.)

2. **Error tracking — Convex.** Decision from the 3.0 spike:
   - **Sentry** (`@sentry/node` or Sentry's Convex integration) initialized in a
     shared Convex module, capturing exceptions in actions/mutations via the
     existing error plumbing (`convex/_lib/errors.ts`, `serviceErrors.ts`
     `toConvexError`). DSN via `SENTRY_DSN` Convex env var.
   - **or Convex Sentinel** (`superpowers:convex-sentinel`) — Convex-native capture
     inside the deployment, no external account. Cheaper; Convex-only.
   - Recommendation: Sentry if the mobile Sentry plan has headroom (one pane of
     glass); Sentinel if cost is a concern. Record the choice in the spike outcome.

3. **Log retention — Convex Log Stream → Axiom.**
   - Configure a Convex Log Stream (Convex dashboard → Settings → Integrations) to
     Axiom (free tier) for the **production** deployment.
   - `convex/_lib/logging/serviceLogger.ts` already emits one-JSON-per-line with
     `requestId`; confirm the stream preserves `function.request_id` correlation.
   - Document the Axiom dataset name + a couple of starter queries in
     `docs/runbooks/rollback.md` (triage section) or a new
     `docs/runbooks/observability.md`.

4. **Uptime monitoring.**
   - Stand up an external monitor (BetterStack or Checkly free tier) hitting
     `https://www.solomindlm.com/` and `https://www.solomindlm.com/api/health`
     every 1–5 min, alerting to email (and the deploy webhook channel).
   - Optional: Checkly can run the Playwright specs as scheduled synthetics
     against production — note as a future enhancement, not built now.
   - This is account/dashboard setup; the deliverable in-repo is a checklist +
     links in `docs/runbooks/observability.md`.

5. **Deploy notifications.**
   - Add a step to the Phase 3 `deploy-smoke.yml` (and optionally the E2E-preview
     job) that posts to a Slack or Discord incoming webhook
     (`DEPLOY_WEBHOOK_URL` repo secret): deploy environment, commit, status
     (smoke pass/fail), `target_url`.
   - Keep it low-noise: production deploys + any failure. Skip success chatter for
     previews.

**Verification (Phase 3.5):**
- Throw a deliberate error in a web route on a preview build; confirm it appears
  in the Sentry web project with the right release/environment.
- Throw a deliberate error in a Convex action; confirm capture (Sentry or
  Sentinel).
- Confirm log lines land in Axiom within the stream's latency window and retain
  `requestId`.
- Confirm the uptime monitor shows green and fires on a forced 404.
- Confirm a production deploy posts one webhook message with smoke status.

---

### Phase 4 — Hardening

**PR scope:** new `renovate.json`, `.github/workflows/codeql.yml`,
`.github/CODEOWNERS`, `ci.yml` (`bun audit` step), web vitest config
(coverage floor), `ci.yml` (`test-coverage` on PRs).

1. **Renovate.** `renovate.json`:
   - `extends: ["config:recommended", "helpers:pinGitHubActionDigests"]`.
   - `schedule`: weekly, off-peak; `timezone` set.
   - `lockFileMaintenance: { enabled: true }`.
   - `dependencyDashboard: true`.
   - `packageRules` groups:
     - `@convex-dev/*` + `convex` + `convex-helpers` + `convex-test` → one PR
       ("Convex").
     - `@langchain/*` + `langsmith` → one PR ("LangChain").
     - dev tooling (`@biomejs/biome`, `vitest`, `@playwright/test`, `typescript`,
       `@typescript/native-preview`, `@types/*`) → one PR ("dev-deps").
     - Respect existing exact pins (`convex@1.42.3`, `@biomejs/biome@2.4.16`) and
       `overrides` (`react`/`react-dom` `19.2.0`) — Renovate proposes bumps;
       reviewer decides. Consider `rangeStrategy: "pin"` to keep the lockfile-style
       exactness.
   - Requires enabling the Renovate GitHub App on the repo (operator action).
   - Choose Renovate over Dependabot for the monorepo grouping and dashboard.

2. **`bun audit` in CI.**
   - Add a step to the `lint` job (or a new `audit` job): `bun audit --audit-level=high`.
   - `continue-on-error: true` initially to capture the current baseline without
     blocking; a follow-up flips it to blocking once existing advisories are
     triaged.

3. **CodeQL.** `.github/workflows/codeql.yml` from GitHub's default JS/TS template:
   - `on: push` (`main`) + `pull_request` (`main`) + `schedule` (weekly).
   - `languages: [javascript-typescript]`.
   - `paths-ignore`: `convex/_generated/**`, `.worktrees/**`, `apps/mobile/**`,
     `docs/**`.

4. **`.github/CODEOWNERS`.**
   - `* @samintisar`
   - Explicit sensitive paths → `@samintisar` (documents intent; enables
     `require_code_owner_reviews` later): `/convex/auth.ts`, `/convex/schema.ts`,
     `/convex/http.ts`, `/apps/web/vercel.json`, `/.github/`,
     `/convex/_lib/` (env/limits/errors).

5. **Coverage floor.**
   - Add `coverage.thresholds` to `apps/web` vitest config, set to the current
     measured numbers (run `bun run test:web:coverage` to read them; do not invent
     targets).
   - Change `test-coverage` job `if:` to also run on `pull_request`; the job fails
     when coverage drops below the floor.
   - Ratchet the floor upward in later, unrelated PRs.

**Verification (Phase 4):**
- Renovate onboarding PR + dependency dashboard issue appear after enabling the app.
- CodeQL run completes and uploads results to the Security tab.
- `bun audit` step runs and prints the current advisory count.
- Open a PR touching `convex/schema.ts`; confirm a CODEOWNERS review request.
- Drop a covered line locally; `bun run test:web:coverage` fails the threshold.

---

## Cross-cutting concerns

- **Node/Bun single-sourcing.** `package.json` `packageManager` + `engines` is the
  source of truth. The composite action reads `bun-version-file: package.json`.
  Set Vercel's project Node/Bun setting to match (operator action; note in
  `README.md` Deployment section).
- **Guard-test coupling.** Any `apps/web/vercel.json` change must update the
  `typecheck-convex` guard assertions in the **same commit**, or CI fails. Called
  out in Phase 3.0.
- **`.claude/settings.json` hooks.** Local auto-typecheck hooks already cover
  web + convex on edit; CI is the enforcement backstop. No hook changes needed.
- **Secrets inventory (repo → Actions):** existing — `TAVILY_API_KEY`,
  `E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`; existing var — `VITE_CONVEX_URL`. New —
  `CONVEX_DEPLOY_KEY` (for env-drift + optional preview), `DEPLOY_WEBHOOK_URL`,
  and Sentry/Axiom tokens live in Vercel/Convex env, not Actions.

## Risks & open questions

1. **Convex plan tier for previews** — resolved by the Phase 3.0 spike. If not
   viable, previews use a shared non-prod Convex deployment and the E2E test
   account lives there.
2. **`deployment_status` as required checks** — GitHub treats these awkwardly;
   E2E and smoke start advisory. Promotion to required is a follow-up once stable.
3. **Canonical env key set is undefined** — `.env.example` is partial. Phase 3.4
   must define it (complete `.env.example` or add `convex/env.required.json`).
4. **Tavily in unit tests** — Phase 2 determines whether the real key is needed;
   until then it stays.
5. **Sentry cost** — mobile already consumes the Sentry plan; adding web + Convex
   projects may hit event quotas. Phase 3.5 sets low sample rates; Sentinel is the
   fallback for Convex.
6. **E2E flake against live previews** — network-dependent; `retries: 2` already
   set. Keep advisory until the flake rate is known.

## Testing strategy

CI/CD configuration is not unit-testable. Verification for every phase is
observing real workflow runs on a throwaway branch/PR, plus the per-phase checks
listed above. Specifically:

- Phase 1: `bun run typecheck:web` locally + new checks visible on a PR.
- Phase 2: cache-hit + wall-clock comparison across two consecutive runs.
- Phase 3: `deployment_status`-triggered jobs observed firing on a real preview;
  a deliberately broken smoke marker confirmed red; env-drift script run locally.
- Phase 3.5: deliberate errors confirmed in Sentry/Sentinel; log lines confirmed
  in Axiom; uptime monitor forced red; one webhook message per prod deploy.
- Phase 4: Renovate dashboard issue; CodeQL run; `bun audit` baseline; CODEOWNERS
  review request on a `convex/schema.ts` PR; coverage threshold failure locally.

## Definition of done

- All five phase PRs merged to `main`.
- Branch protection lists and enforces the real required checks (incl.
  `Typecheck (Web)`, `Workflow Lint`).
- A merge that breaks web types is blocked by CI.
- CI second-run wall-clock is measurably lower than today (cache hits confirmed).
- Every production deploy produces a smoke-check result on the commit and one
  webhook notification.
- `docs/runbooks/rollback.md` and `docs/runbooks/observability.md` exist and are
  linked from `README.md`.
- Web and Convex runtime errors are captured with alerting; production logs stream
  to Axiom; an external uptime monitor is live.
- Renovate is enabled and producing grouped PRs; CodeQL and `bun audit` run in CI;
  `.github/CODEOWNERS` exists.
