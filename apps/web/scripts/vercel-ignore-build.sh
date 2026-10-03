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

# Changed files, two ways:
# - Previous deployment known: compare its snapshot with HEAD. If nothing
#   app-relevant differs from what is already deployed, the preview is current.
# - First deployment of the branch: list every file the branch's own commits
#   (main..HEAD) touched. A snapshot diff against a merge base isn't safe here:
#   in a shallow clone merge-base can return an older ancestor, and a branch
#   that reverts a later main change would then show no diff at all.
prev="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -n "$prev" ] && git cat-file -e "${prev}^{commit}" 2>/dev/null; then
  since="${prev:0:8}"
  changed=$(git diff --name-only "$prev" "$head_sha" 2>/dev/null) || build "git diff failed"
else
  owner="${VERCEL_GIT_REPO_OWNER:-}"
  slug="${VERCEL_GIT_REPO_SLUG:-}"
  [ -n "$owner" ] && [ -n "$slug" ] || build "no previous deployment and no VERCEL_GIT_REPO_OWNER/SLUG to find main"
  url="https://github.com/${owner}/${slug}.git"
  # Vercel clones shallowly: deepen this commit's history and fetch main. The
  # repo is public, so no credentials are needed.
  git fetch --quiet --deepen=200 "$url" "$head_sha" 2>/dev/null || true
  git fetch --quiet --depth=200 "$url" main 2>/dev/null || build "could not fetch main"
  main_sha=$(git rev-parse FETCH_HEAD 2>/dev/null) || build "could not resolve main"
  branch_commits=$(git rev-list "${main_sha}..${head_sha}" 2>/dev/null) || build "git rev-list failed"
  # A branch commit at the shallow boundary means some of the branch's history
  # wasn't fetched, so its file list could be incomplete.
  shallow_file=$(git rev-parse --git-path shallow)
  if [ -n "$branch_commits" ] && [ -s "$shallow_file" ] &&
    printf '%s\n' "$branch_commits" | grep -qxFf "$shallow_file"; then
    build "branch history extends past the fetched window"
  fi
  since="main (${main_sha:0:8})"
  # --cc: a merge commit (e.g. "Update branch") only counts files whose
  # merged content differs from every parent, i.e. conflict resolutions.
  # Capture git log on its own: in a pipeline its failure would be masked by
  # sort's exit status and leave an empty list (-> a wrong skip).
  log_out=$(git log --no-renames --cc --name-only --format= "${main_sha}..${head_sha}" 2>/dev/null) ||
    build "git log failed"
  # --cc hides a merge that resolves a conflict by keeping the branch side,
  # which silently undoes main's change. Also list where each merge result
  # differs from its other parents (normally main); a clean merge adds nothing.
  merges=$(git rev-list --merges "${main_sha}..${head_sha}" 2>/dev/null) || build "git rev-list --merges failed"
  for merge in $merges; do
    for parent in $(git rev-list --parents -n 1 "$merge" | cut -d' ' -f3-); do
      merge_out=$(git diff --no-renames --name-only "$parent" "$merge" 2>/dev/null) ||
        build "git diff of merge ${merge:0:8} failed"
      log_out="${log_out}"$'\n'"${merge_out}"
    done
  done
  changed=$(printf '%s\n' "$log_out" | sed '/^$/d' | sort -u)
fi
[ -n "$changed" ] || skip "no file changes since $since"

# Paths that never reach the web build or `convex deploy`. Keep this list
# conservative: a path missing here only costs a build.
skippable='^(docs/|\.github/|\.claude/|\.agents/|\.cursor/|\.vscode/|\.serena/|\.githooks/|apps/mobile/|evals/|e2e/|archive/|flowcharts/)|^[^/]+\.md$|^(knip\.json|\.coderabbit\.yaml|renovate\.json|playwright\.config\.ts|tsconfig\.e2e\.json|vitest\.convex\.config\.ts|environment\.yml|skills-lock\.json|\.editorconfig|LICENSE|\.env\.example|\.env\.e2e\.example)$'

relevant=$(printf '%s\n' "$changed" | grep -Ev "$skippable" || true)
if [ -n "$relevant" ]; then
  build "app-affecting changes since $since: $(printf '%s\n' "$relevant" | head -5 | tr '\n' ' ')"
fi
skip "only docs/CI/mobile/eval changes since $since"
