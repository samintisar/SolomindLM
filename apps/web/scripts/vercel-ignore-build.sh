#!/usr/bin/env bash
# Vercel "Ignored Build Step" (apps/web/vercel.json `ignoreCommand`).
# Exit 0 = skip the build, exit 1 = build. Vercel runs this from the project
# root directory (apps/web).
#
# Every preview build runs `convex deploy`, which claims a Convex preview
# deployment (team quota: 40). Skip previews whose changes can't affect the web
# bundle or the Convex functions: docs, CI config, mobile, evals, e2e.
#
# Fail-safe: production always builds, and anything this script can't decide
# (no diff base, git errors, a path not on the skip list) builds.
set -u

build() { echo "vercel-ignore-build: building — $1"; exit 1; }
skip() { echo "vercel-ignore-build: skipping — $1"; exit 0; }

[ "${VERCEL_ENV:-}" = "production" ] && build "production deployment"

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || build "not a git checkout"
head_sha=$(git rev-parse HEAD 2>/dev/null) || build "no HEAD"

# Diff base: the branch's last successful deployment, else its merge base with main.
base=""
prev="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -n "$prev" ] && git cat-file -e "${prev}^{commit}" 2>/dev/null; then
  base="$prev"
else
  owner="${VERCEL_GIT_REPO_OWNER:-}"
  slug="${VERCEL_GIT_REPO_SLUG:-}"
  [ -n "$owner" ] && [ -n "$slug" ] || build "no previous deployment and no VERCEL_GIT_REPO_OWNER/SLUG to find main"
  url="https://github.com/${owner}/${slug}.git"
  # Vercel clones shallowly; deepen this commit's history and fetch main so a
  # merge base exists. The repo is public, so no credentials are needed.
  # If the true merge base is beyond the shallow cut, merge-base finds no
  # base (-> build) or an older common ancestor, whose diff is a superset
  # of the branch's changes (-> builds at least as often).
  git fetch --quiet --deepen=200 "$url" "$head_sha" 2>/dev/null || true
  if git fetch --quiet --depth=200 "$url" main 2>/dev/null; then
    base=$(git merge-base FETCH_HEAD "$head_sha" 2>/dev/null) || base=""
  fi
fi
[ -n "$base" ] || build "no diff base (previous deployment or merge base with main)"

changed=$(git diff --name-only "$base" "$head_sha" 2>/dev/null) || build "git diff failed"
[ -n "$changed" ] || skip "no file changes since ${base:0:8}"

# Paths that never reach the web build or `convex deploy`. Keep this list
# conservative: a path missing here only costs a build.
skippable='^(docs/|\.github/|\.claude/|\.agents/|\.cursor/|\.vscode/|\.serena/|\.githooks/|apps/mobile/|evals/|e2e/|archive/|flowcharts/)|^[^/]+\.md$|^(knip\.json|\.coderabbit\.yaml|renovate\.json|playwright\.config\.ts|tsconfig\.e2e\.json|vitest\.convex\.config\.ts|environment\.yml|skills-lock\.json|\.editorconfig|LICENSE|\.env\.example|\.env\.e2e\.example)$'

relevant=$(printf '%s\n' "$changed" | grep -Ev "$skippable" || true)
if [ -n "$relevant" ]; then
  build "app-affecting changes since ${base:0:8}: $(printf '%s\n' "$relevant" | head -5 | tr '\n' ' ')"
fi
skip "only docs/CI/mobile/eval changes since ${base:0:8}"
