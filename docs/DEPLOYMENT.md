# Deployment Guide

## Overview

This project uses **Vercel** for frontend hosting and **Convex** for the backend.
Deployments are coordinated so that the Convex backend deploys first, then the
frontend builds with the correct `VITE_CONVEX_URL`.

## Architecture

```
PR push → Vercel Preview → convex deploy (staging) → Vite build → Preview URL
                                              ↓
                                    GitHub Actions (CI)
                                    - Typecheck
                                    - Build against staging URL
                                    - Health check staging

main push → Vercel Production → convex deploy (prod) → Vite build → Production URL
                                              ↓
                                    GitHub Actions (CI)
                                    - Typecheck
                                    - Build against prod URL
                                    - Health check production
```

## Environment Setup

### Required Vercel Environment Variables

| Variable | Environment | Description |
|----------|-------------|-------------|
| `CONVEX_DEPLOY_KEY` | Production only | Deploy key from Convex Dashboard → Deployment Settings |
| `VITE_CONVEX_URL` | Production | Your production Convex URL (e.g., `https://xxx.convex.cloud`) |
| `VERCEL_ENV` | Auto | Set by Vercel (`production`, `preview`, `development`) |

### Required GitHub Repository Variables

| Variable | Description |
|----------|-------------|
| `VITE_CONVEX_URL` | Same production Convex URL for CI build verification |

## Staging Deployment

We maintain a separate staging Convex deployment for preview builds.
This allows PRs with backend changes to be fully tested end-to-end.

### Required Staging Variables

**Vercel (Preview Environment Only):**
| Variable | Description |
|----------|-------------|
| `CONVEX_DEPLOY_KEY_STAGING` | Deploy key from staging deployment in Convex Dashboard |
| `VITE_CONVEX_URL_STAGING` | Staging deployment URL (e.g., `https://xxx.convex.cloud`) |

**GitHub Repository Variables:**
| Variable | Description |
|----------|-------------|
| `VITE_CONVEX_URL_STAGING` | Same staging URL for CI build verification |

### Setup Steps

1. **Create staging deployment in Convex Dashboard**
   - Go to https://dashboard.convex.dev
   - Create a new deployment (e.g., `solomindlm-staging`)
   - Generate a deploy key for staging

2. **Configure Vercel**
   - Go to Project Settings → Environment Variables
   - Add `CONVEX_DEPLOY_KEY_STAGING` and `VITE_CONVEX_URL_STAGING` to **Preview** environment only
   - Keep production variables unchanged

3. **Configure GitHub**
   - Add `VITE_CONVEX_URL_STAGING` as a repository variable

### How Preview Builds Work

**Preview (PR) builds:**
- Use `CONVEX_DEPLOY_KEY_STAGING` to deploy backend to staging
- Set `VITE_CONVEX_URL` to staging URL for frontend
- Frontend connects to staging backend
- CI verifies staging health

**Production (main) builds:**
- Use `CONVEX_DEPLOY_KEY` to deploy to production
- Set `VITE_CONVEX_URL` to production URL
- Frontend connects to production backend
- CI verifies production health

### Limitations

- **Shared staging:** All preview builds use the same staging deployment
- **Data isolation:** Staging data is shared across all previews
- **Concurrent previews:** Multiple active PRs may overwrite staging data
- **Best practice:** Use test accounts and seed data in staging

### Staging Cleanup

Reset staging data periodically:
```bash
# Reset staging database
bun run staging:cleanup
```

## Deployment Flow

### Production Deployments

1. Push to `main` branch
2. Vercel triggers build
3. Build command (from `vercel.json`):
   ```bash
   bun x convex deploy --cmd "bun run build:prod" --cmd-url-env-var-name VITE_CONVEX_URL
   ```
4. Convex deploys backend functions
5. Frontend builds with `VITE_CONVEX_URL` set to production URL
6. GitHub Actions runs post-deploy health check

### Preview Deployments

- **Preview builds skip Convex deploy** to avoid overwriting production backend
- Preview uses the production Convex URL but does NOT push backend changes
- This means preview frontends may be testing against an outdated backend

> **Note:** For full preview/backend parity, consider setting up a dedicated
> staging Convex deployment. See "Staging Strategy" below.

## Rolling Back

### Option 1: Rollback via Convex Dashboard (Fastest)

1. Go to [Convex Dashboard](https://dashboard.convex.dev)
2. Select your deployment
3. Go to **Deployment Settings** → **Previous Versions**
4. Click **Restore** on the desired previous version
5. This instantly reverts the backend

### Option 2: Rollback via CLI

```bash
# Rollback to previous deployment
npx convex deploy --previous

# Or rollback to a specific version
npx convex deploy --version <version-id>
```

### Option 3: Git Revert + Redeploy

```bash
git revert <bad-commit>
git push origin main
```

## Environment Variables

### Pushing Env Vars to Convex

We provide a convenience script that wraps the official Convex CLI:

```bash
# Push .env.local to dev deployment
bun run convex:env:push

# Push .env to production
bun run convex:env:push:prod

# Preview what would be pushed (dry run)
bun run convex:env:push:dry
```

> **Security:** This script reads from local `.env` files and uses `npx convex env set`
> to push variables. Never commit `.env` files — they are gitignored by default.

### Manual Env Management

```bash
# Set a single variable
npx convex env set MY_VAR "my_value"

# Set in production
npx convex env set --prod MY_VAR "my_value"

# List all env vars
npx convex env list

# Remove a variable
npx convex env remove MY_VAR
```

## Health Checks

After deployment, the CI pipeline verifies the backend is healthy by calling:

```
GET https://<your-deployment>.convex.cloud/api/health/check
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": 1716234567890,
  "version": "1.0.0"
}
```

## Troubleshooting

### 409 ExistingModuleHashConflict

**Cause:** Two deployment processes running simultaneously (e.g., CI + Vercel)

**Fix:** We intentionally do NOT run `convex deploy` in GitHub Actions. The deploy
only happens in Vercel's build step. If you see this error, check for duplicate
d deployment triggers.

### Preview Builds Failing

**Cause:** Preview builds skip Convex deploy but may reference backend features
that don't exist yet.

**Fix:** This is expected behavior. Preview frontends run against the current
production backend. For full preview parity, set up a staging deployment.

## Staging Strategy (Optional)

For teams that need preview/backend parity:

1. Create a separate Convex deployment (e.g., `solomindlm-staging`)
2. Set `CONVEX_DEPLOY_KEY` for staging in Vercel preview environment
3. Modify `vercel.json` build command to deploy to staging for previews:
   ```bash
   if [ "$VERCEL_ENV" = "preview" ]; then
     bun x convex deploy --cmd "bun run build:prod" --cmd-url-env-var-name VITE_CONVEX_URL --deployment staging-deployment-name;
   else
     bun x convex deploy --cmd "bun run build:prod" --cmd-url-env-var-name VITE_CONVEX_URL;
   fi
   ```
4. Add staging health check to CI

## Security Checklist

- [ ] `.env` files are in `.gitignore`
- [ ] `CONVEX_DEPLOY_KEY` is set in Vercel **Production only**
- [ ] API keys are rotated regularly (every 90 days recommended)
- [ ] `VITE_CONVEX_URL` repo variable is set in GitHub
- [ ] No secrets in repository code or logs
