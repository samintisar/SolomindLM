/**
 * Pin this clone to LF so Git for Windows (`core.autocrlf=true` in the
 * system config) cannot fight `.gitattributes` `eol=lf` and leave hundreds
 * of phantom "whitespace" changes on `git status`.
 *
 * Runs from `bun install` via the root `prepare` script. No-ops outside a
 * git work tree (CI archives, copied trees).
 */
import { execFileSync } from "node:child_process";

function git(args, options = {}) {
  return execFileSync("git", args, {
    stdio: options.stdio ?? "ignore",
    encoding: "utf8",
  });
}

try {
  git(["rev-parse", "--is-inside-work-tree"]);
} catch {
  process.exit(0);
}

git(["config", "--local", "core.autocrlf", "false"]);
git(["config", "--local", "core.eol", "lf"]);
