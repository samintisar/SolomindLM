#!/usr/bin/env node
/**
 * Claude Code SessionStart hook: install dependencies in a fresh checkout without blocking.
 *
 * Worktrees the desktop app creates (.claude/worktrees/<name>) start with no node_modules, and a
 * cold `bun install` takes ~3.5 min on Windows. When node_modules is missing this starts the
 * install as a detached background process and tells the agent where its log is, so the session
 * can read code while it runs. With node_modules present (the main checkout, a resumed session)
 * it does nothing.
 *
 *   node .claude/hooks/session-start.mjs                 hook entry point
 *   node .claude/hooks/session-start.mjs install <log>   the detached runner (internal)
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
const key = createHash("sha1").update(projectDir).digest("hex").slice(0, 12);
const stateDir = join(tmpdir(), "solomindlm-claude-hooks");
const lockPath = join(stateDir, `${key}-install.lock`);
const DONE_MARKER = "bun install finished";
// A cold install takes ~3.5 min; a lock older than this belongs to a runner that died.
const STALE_LOCK_MS = 15 * 60 * 1000;

/** Runs in the detached child: install, record the outcome in the log, release the lock. */
function runInstall(logPath) {
  const result = spawnSync("bun", ["install", "--frozen-lockfile"], {
    cwd: projectDir,
    stdio: ["ignore", "inherit", "inherit"],
    windowsHide: true,
  });
  const status = result.error ? result.error.message : `exit ${result.status}`;
  appendFileSync(logPath, `\n${DONE_MARKER} (${status})\n`);
  rmSync(lockPath, { force: true });
}

function startInstall() {
  mkdirSync(stateDir, { recursive: true });
  const logPath = join(stateDir, `${key}-install.log`);
  if (existsSync(lockPath) && Date.now() - statSync(lockPath).mtimeMs > STALE_LOCK_MS) {
    rmSync(lockPath, { force: true });
  }
  try {
    closeSync(openSync(lockPath, "wx"));
  } catch {
    return logPath; // An install for this checkout is already running (e.g. /clear mid-install).
  }
  rmSync(logPath, { force: true });
  const log = openSync(logPath, "a");
  const child = spawn(
    process.execPath,
    [fileURLToPath(import.meta.url), "install", logPath],
    { cwd: projectDir, detached: true, stdio: ["ignore", log, log], windowsHide: true }
  );
  child.unref();
  closeSync(log);
  return logPath;
}

if (process.argv[2] === "install") {
  runInstall(process.argv[3]);
} else if (!existsSync(join(projectDir, "node_modules"))) {
  const logPath = startInstall();
  // SessionStart stdout is added to the agent's context.
  process.stdout.write(
    `node_modules is missing in this checkout, so \`bun install\` is running in the background (log: ${logPath}). ` +
      `Read and plan freely, but before running any bun/bunx/vitest/tsgo command wait until that log ends with "${DONE_MARKER}". ` +
      "Do not start a second `bun install` while it runs.\n"
  );
}
