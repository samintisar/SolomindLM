#!/usr/bin/env bash
# Run the /dev/design screenshot tests (playwright.design.config.ts) in the official
# Playwright Linux image, so local baselines match CI pixel for pixel.
#
#   bun run test:design            # compare against e2e/design/__screenshots__
#   bun run test:design:update     # rewrite the baselines (commit the PNGs)
#   scripts/design-snapshots.sh [any extra playwright test args]
#
# The host checkout is mounted READ-ONLY and copied inside the container (without
# node_modules, .git, worktrees, build output), and dependencies are installed into that
# copy. The host node_modules (Windows native binaries on a Windows checkout) is never
# touched. Only two narrow writable mounts carry results back:
#   e2e/design/__screenshots__   the baselines (always copied back)
#   test-results/                diffs and traces (copied back on failure)
#
# Works from Git Bash on Windows and plain bash on Linux. Needs Docker.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# The image tag must match the installed @playwright/test exactly (browser builds differ).
PW_VERSION="$(grep -oE '"@playwright/test@[0-9]+\.[0-9]+\.[0-9]+"' bun.lock | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
BUN_VERSION="$(grep -oE '"packageManager": *"bun@[0-9.]+"' package.json | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
if [ -z "$PW_VERSION" ] || [ -z "$BUN_VERSION" ]; then
  echo "design-snapshots: could not read the Playwright version (bun.lock) or Bun version (package.json)" >&2
  exit 1
fi
IMAGE="mcr.microsoft.com/playwright:v${PW_VERSION}-noble"

if [ ! -f apps/web/.env.local ] && [ -z "${VITE_CONVEX_URL:-}" ]; then
  echo "design-snapshots: the Vite build needs VITE_CONVEX_URL (apps/web/.env.local or the environment)" >&2
  exit 1
fi

mkdir -p e2e/design/__screenshots__ test-results

# Docker on Windows wants C:/... paths, and MSYS must not rewrite the container-side paths.
host_path() {
  if (cd "$1" && pwd -W) >/dev/null 2>&1; then
    (cd "$1" && pwd -W)
  else
    (cd "$1" && pwd)
  fi
}
SRC="$(host_path "$ROOT")"
SHOTS="$(host_path "$ROOT/e2e/design/__screenshots__")"
RESULTS="$(host_path "$ROOT/test-results")"

HOST_UID="$(id -u 2>/dev/null || echo 0)"
HOST_GID="$(id -g 2>/dev/null || echo 0)"

# Runs inside the container. Arguments: playwright test args.
read -r -d '' INNER <<'EOF' || true
set -euo pipefail

echo "design-snapshots: copying the read-only checkout to /work"
mkdir -p /work
tar -C /src \
  --exclude=node_modules \
  --exclude=./.git \
  --exclude=./.worktrees \
  --exclude=./.claude \
  --exclude=./.serena \
  --exclude=./.env \
  --exclude=./.env.local \
  --exclude=./.env.e2e \
  --exclude=dist \
  --exclude=coverage \
  --exclude=./test-results \
  --exclude=./playwright-report \
  --exclude='*.tsbuildinfo' \
  -cf - . | tar -C /work -xf -
cd /work

echo "design-snapshots: installing bun ${BUN_VERSION}"
npm install --global --silent --no-fund --no-audit "bun@${BUN_VERSION}" >/dev/null
bun --version

echo "design-snapshots: bun install --frozen-lockfile"
# No .git in the copy, so the root `prepare` git-config scripts no-op.
bun install --frozen-lockfile

status=0
bunx playwright test -c playwright.design.config.ts "$@" || status=$?

cp -a e2e/design/__screenshots__/. /out/screenshots/
if [ "$status" -ne 0 ] && [ -d test-results ]; then
  rm -rf /out/test-results/* 2>/dev/null || true
  cp -a test-results/. /out/test-results/
fi
chown -R "${HOST_UID}:${HOST_GID}" /out/screenshots /out/test-results 2>/dev/null || true
exit "$status"
EOF

env_args=(-e CI=true -e "BUN_VERSION=$BUN_VERSION" -e "HOST_UID=$HOST_UID" -e "HOST_GID=$HOST_GID")
# Forward the Convex URL when set in the environment (CI-style); otherwise Vite reads the
# copied apps/web/.env.local. Passed by name so the value never appears on a command line.
if [ -n "${VITE_CONVEX_URL:-}" ]; then
  env_args+=(-e VITE_CONVEX_URL)
fi

echo "design-snapshots: running in $IMAGE"
MSYS_NO_PATHCONV=1 docker run --rm --init --ipc=host \
  "${env_args[@]}" \
  -v "$SRC:/src:ro" \
  -v "$SHOTS:/out/screenshots" \
  -v "$RESULTS:/out/test-results" \
  -v solomind-design-snapshots-bun-cache:/root/.bun/install/cache \
  -w /work \
  "$IMAGE" \
  bash -c "$INNER" design-snapshots "$@"
