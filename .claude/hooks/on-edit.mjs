#!/usr/bin/env node
/**
 * Claude Code PostToolUse hook for file edits — built-in Edit/Write and Serena's edit tools.
 *
 *   node .claude/hooks/on-edit.mjs format     (sync)  Biome --write on the edited file only.
 *                                                     Remaining errors → exit 2 so Claude sees them.
 *   node .claude/hooks/on-edit.mjs typecheck  (async) Typecheck the workspace the file belongs to.
 *                                                     Failures reach Claude via additionalContext.
 *
 * Serena passes `relative_path` (relative to Serena's active project). It resolves against this
 * project dir, so when Serena is activated on a different checkout the hook touches the wrong
 * copy — harmless (an unchanged file stays unchanged); the pre-commit hook is the backstop.
 * Multi-file Serena tools (rename_symbol, replace_in_files) carry no single path and are skipped.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

const mode = process.argv[2];
const projectDir = resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
const MAX_OUTPUT_LINES = 40;
const STALE_LOCK_MS = 5 * 60 * 1000;

function readInput() {
  try {
    const raw = readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Project-relative POSIX path of the edited file, or null if there isn't one in this project. */
function editedPath(input) {
  const toolInput = input.tool_input ?? {};
  const raw = toolInput.file_path ?? toolInput.relative_path;
  if (typeof raw !== "string" || raw.length === 0) return null;
  const abs = isAbsolute(raw) ? raw : resolve(projectDir, raw);
  const rel = relative(projectDir, abs).replace(/\\/g, "/");
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return null;
  if (!existsSync(abs)) return null;
  return rel;
}

/** No shell: the edited path goes in as a plain argv entry, never interpreted. */
function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: projectDir,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  const output =
    `${result.error ? `${result.error.message}\n` : ""}${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  return { ok: result.status === 0, output };
}

function truncate(output) {
  const lines = output.split(/\r?\n/);
  if (lines.length <= MAX_OUTPUT_LINES) return output;
  return [
    ...lines.slice(0, MAX_OUTPUT_LINES),
    `… ${lines.length - MAX_OUTPUT_LINES} more lines`,
  ].join("\n");
}

function format(rel) {
  const { ok, output } = run("bun", [
    "x",
    "biome",
    "check",
    "--write",
    "--files-ignore-unknown=true",
    "--no-errors-on-unmatched",
    "--diagnostic-level=error",
    "--colors=off",
    "--max-diagnostics=20",
    "--",
    rel,
  ]);
  if (ok) return 0;
  process.stderr.write(`Biome errors remain in ${rel} after auto-fix:\n${truncate(output)}\n`);
  return 2;
}

function typecheckTarget(rel) {
  if (!/\.(ts|tsx)$/.test(rel) || rel.includes("/_generated/")) return null;
  if (rel.startsWith("apps/web/")) return "web";
  if (rel.startsWith("apps/mobile/")) return "mobile";
  if (rel.startsWith("convex/")) return "convex";
  return null;
}

/**
 * Async hooks are not deduplicated, so a burst of edits would start one full typecheck each.
 * One runner per (project, target) holds a lock; later firings mark the target dirty and exit,
 * and the runner re-checks until clean. Only the runner reports, and only failures or a
 * failure→pass recovery, so passing typechecks add no context noise.
 */
function typecheck(target) {
  const key = createHash("sha1").update(projectDir).digest("hex").slice(0, 12);
  const stateDir = join(tmpdir(), "solomindlm-claude-hooks");
  mkdirSync(stateDir, { recursive: true });
  const base = join(stateDir, `${key}-${target}`);
  const lockPath = `${base}.lock`;
  const dirtyPath = `${base}.dirty`;
  const lastFailedPath = `${base}.failed`;

  writeFileSync(dirtyPath, "");
  let result = { ok: true, output: "" };
  // Re-check dirty after releasing the lock: an edit landing between the last check and the
  // release would otherwise go unchecked.
  while (existsSync(dirtyPath)) {
    try {
      if (existsSync(lockPath) && Date.now() - statSync(lockPath).mtimeMs > STALE_LOCK_MS) {
        rmSync(lockPath, { force: true });
      }
      closeSync(openSync(lockPath, "wx"));
    } catch {
      return; // A runner is active; it will see the dirty flag and report.
    }
    try {
      while (existsSync(dirtyPath)) {
        rmSync(dirtyPath, { force: true });
        result = run("bun", ["run", `typecheck:${target}`]);
      }
    } finally {
      rmSync(lockPath, { force: true });
    }
  }

  const failedBefore = existsSync(lastFailedPath);
  let message = null;
  if (!result.ok) {
    writeFileSync(lastFailedPath, "");
    message = `\`bun run typecheck:${target}\` failed after your recent edits:\n${truncate(result.output)}`;
  } else if (failedBefore) {
    rmSync(lastFailedPath, { force: true });
    message = `\`bun run typecheck:${target}\` passes again.`;
  }
  if (message) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: message },
      })
    );
  }
}

const rel = editedPath(readInput());
if (!rel) process.exit(0);

if (mode === "format") {
  process.exit(format(rel));
} else if (mode === "typecheck") {
  const target = typecheckTarget(rel);
  if (target) typecheck(target);
  process.exit(0);
} else {
  process.stderr.write(`on-edit.mjs: unknown mode "${mode}"\n`);
  process.exit(1);
}
