# Convex Preview Deployments — Spike Outcome

**Date:** 2026-09-08
**Decision:** VIABLE

## Findings

- **Plan tier:** paid (Convex preview deployments require a paid plan; a preview
  deploy key was successfully issued, which confirms the tier).
- **Preview deploy key:** issued from the Convex dashboard (Settings → Deploy Keys
  → Preview) and provided out-of-band. It is **not** stored in the repo — it is
  set only as `CONVEX_DEPLOY_KEY` in the Vercel **Preview** environment scope.
- **Cost:** preview deployments bill like a small dev deployment; incremental cost
  at current PR volume is negligible. (Update this line with the observed figure
  after a billing cycle if it matters.)
- **CLI support:** `convex@1.42.3` `convex deploy --help` states that when
  `CONVEX_DEPLOY_KEY` is a **preview** key, `convex deploy` deploys to a preview
  deployment **named after the current Git branch automatically** in Vercel CI —
  no `--preview-create` / `--preview-name` flag required. Convex handles branch-name
  sanitization internally.

## Chosen approach

**VIABLE — per-PR Convex backend via the preview deploy key, no build-command branching.**

The plan's Task 13 (`if [ "$VERCEL_ENV" = "preview" ]; then convex deploy
--preview-create "$VERCEL_GIT_COMMIT_REF" …`) is **superseded**. Branch names
contain `/` and other characters that are not valid Convex deployment names, and
the CLI already derives and sanitizes the name from the Vercel git ref. The
routing between production and preview is done entirely by the **type of
`CONVEX_DEPLOY_KEY`** Vercel injects:

- Vercel **Production** scope → production deploy key → `convex deploy` targets the
  production deployment (unchanged).
- Vercel **Preview** scope → preview deploy key → `convex deploy` targets an
  isolated preview deployment named after the branch, auto-created / reused.

A Convex **preview key cannot deploy to production** (it is scope-limited), so the
previous "preview must be build-only to avoid clobbering prod" safeguard is no
longer needed — the key scope enforces it.

### `apps/web/vercel.json` change (Task 13, revised)

`buildCommand` collapses to a single branch — identical for production and preview:

```
cd ../.. && bun x convex deploy --cmd "bun run build:prod" --cmd-url-env-var-name VITE_CONVEX_URL
```

### `ci.yml` guard test change (Task 14, revised)

The `typecheck-convex` "Assert Vercel …" step drops the `VERCEL_ENV` / `preview`
build-only assertions (obsolete) and instead asserts:
1. `buildCommand` runs `convex deploy` (so Convex + Vite bundle ship together).
2. `convex deploy` passes `--cmd-url-env-var-name VITE_CONVEX_URL` (so the built
   bundle targets the deployment it just pushed to — preview bundle → preview
   backend).

### Operator step

Set `CONVEX_DEPLOY_KEY` = the preview deploy key in Vercel → Project → Settings →
Environment Variables, scoped to **Preview only**. Do not change the
Production-scoped `CONVEX_DEPLOY_KEY`.

## `VITE_CONVEX_SITE_URL` on previews — resolved

Investigated after the first successful preview deploy (`befitting-mink-637`):

- The **web bundle already derives the site URL**: `chatStream.ts`,
  `resolveAudioPlaybackUrl.ts`, and `vite.config.ts` all compute
  `VITE_CONVEX_SITE_URL || VITE_CONVEX_URL.replace('.cloud', '.site')`. The
  browser calls Convex HTTP actions (`/chat/stream`, `/research/execute`,
  `/audio/:id`) **directly** at that derived `.site` URL — `grep` confirms
  **nothing in `apps/web/src` calls `/api/*`**.
- On a preview build `convex deploy` sets `VITE_CONVEX_URL` to the per-branch
  preview `.convex.cloud`, so the derived `.site` URL is per-branch-correct —
  **as long as `VITE_CONVEX_SITE_URL` is not set in Vercel's Preview scope**
  (an explicit value there would override the derivation and leak to prod).

**Action:** ensure `VITE_CONVEX_SITE_URL` in Vercel is **Production-scoped only**
(or removed entirely — the code derives it). Do not set it for Preview.

The `/api/(.*)` → `${VITE_CONVEX_SITE_URL}/api/$1` rewrite in `apps/web/vercel.json`
is now **unused by the app**. It stays only as a convenience proxy; the Task 16
smoke check should hit the Convex `.site` `/health` route directly (derived from
the deploy's `VITE_CONVEX_URL`) rather than `$TARGET_URL/api/health`, or the
rewrite can be dropped in that task.

## E2E test account (feeds Task 15)

With per-branch preview backends, the `E2E_TEST_*` account will not exist in a
fresh preview deployment unless seeded. Options for Task 15:
- Add a `--preview-run <seedFn>` to the `convex deploy` command that creates the
  test account (Convex runs it only for preview deployments).
- Or have `e2e/global-setup.ts` sign up the account if sign-in fails.
Decide when implementing Task 15; record the choice here.
