/**
 * Pre-commit: Biome format + safe lint fixes on the staged files only, then re-stage them.
 * Invoked by `.githooks/pre-commit`.
 *
 * - Fully staged files: `biome check --write`, then `git add` them back.
 * - Partially staged files: --write would rewrite the working tree and re-staging would sweep the
 *   unstaged hunks into the commit. Instead the staged blobs are exported (with the staged Biome
 *   config) to a temp dir under their original relative paths and checked there read-only, so the
 *   check sees exactly what will be committed and the working tree is untouched.
 *
 * Paths come from NUL-delimited git output and go to child processes as argv (no shell) and to
 * git as literal pathspecs, so names with spaces, globs (`[id].tsx`), or non-ASCII stay intact.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// The repo's Biome, called by path: `bun x biome` outside the repo (the snapshot dir) would
// fetch the unrelated npm package `biome` instead. Git runs hooks from the work tree root.
const BIOME = [resolve("node_modules/@biomejs/biome/bin/biome"), "check"];
const BIOME_FLAGS = [
  "--files-ignore-unknown=true",
  "--no-errors-on-unmatched",
  "--diagnostic-level=error",
  "--colors=off",
];
// Stays well under Windows' ~32k command-line limit on big (e.g. merge) commits.
const BATCH = 100;
// Files that affect how Biome treats the checked paths; taken from the index alongside them.
const CONFIG_FILES = ["biome.json", ".editorconfig", ".gitignore"];

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { stdio: "inherit", windowsHide: true, ...options });
  if (result.error) throw result.error;
  return result.status === 0;
}

function gitPaths(args) {
  const result = spawnSync("git", args, { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.split("\0").filter(Boolean);
}

function batches(list) {
  const out = [];
  for (let i = 0; i < list.length; i += BATCH) out.push(list.slice(i, i + BATCH));
  return out;
}

const staged = gitPaths(["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"]);
if (staged.length === 0) process.exit(0);

const unstaged = new Set(gitPaths(["diff", "--name-only", "-z"]));
const fixable = staged.filter((f) => !unstaged.has(f) && existsSync(f));
const checkOnly = staged.filter((f) => unstaged.has(f));

let ok = true;

for (const files of batches(fixable)) {
  ok = run(process.execPath, [...BIOME, "--write", ...BIOME_FLAGS, "--", ...files]) && ok;
  ok = run("git", ["--literal-pathspecs", "add", "--", ...files]) && ok;
}

if (checkOnly.length > 0) {
  const snapshot = mkdtempSync(join(tmpdir(), "solomindlm-pre-commit-"));
  try {
    const exported = [...CONFIG_FILES, ...checkOnly].join("\0");
    const exportOk = run("git", ["checkout-index", "-z", "--stdin", `--prefix=${snapshot}/`], {
      input: exported,
      stdio: ["pipe", "inherit", "inherit"],
    });
    let checkOk = exportOk;
    for (const files of batches(checkOnly)) {
      checkOk =
        run(process.execPath, [...BIOME, ...BIOME_FLAGS, "--", ...files], { cwd: snapshot }) &&
        checkOk;
    }
    if (!checkOk) {
      console.error(
        "pre-commit: the staged version of a partially staged file has Biome errors; " +
          "stage the whole file or run 'bun run lint:fix'"
      );
      ok = false;
    }
  } finally {
    rmSync(snapshot, { recursive: true, force: true });
  }
}

if (!ok) {
  console.error("pre-commit: Biome errors remain after auto-fix (bypass: git commit --no-verify)");
  process.exit(1);
}
