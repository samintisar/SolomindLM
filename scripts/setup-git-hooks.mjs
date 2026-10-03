/**
 * Point this clone's Git hooks at the tracked `.githooks/` directory, so the
 * pre-commit format and pre-push typecheck + lint gates run without a
 * per-developer opt-in.
 *
 * Runs from `bun install` via the root `prepare` script. No-ops outside a git
 * work tree (CI archives, copied trees). Bypass a single push with
 * `git push --no-verify`.
 */
import { execFileSync } from "node:child_process";
import { chmod } from "node:fs/promises";

function git(args) {
  return execFileSync("git", args, { stdio: "ignore", encoding: "utf8" });
}

try {
  git(["rev-parse", "--is-inside-work-tree"]);
} catch {
  process.exit(0);
}

git(["config", "--local", "core.hooksPath", ".githooks"]);

// Defensive: ensure the hooks are executable on POSIX (no-op semantics on Windows).
for (const hook of ["pre-commit", "pre-push"]) {
  try {
    await chmod(`.githooks/${hook}`, 0o755);
  } catch {
    // Hook file missing or FS without POSIX perms — hooksPath is still set.
  }
}
