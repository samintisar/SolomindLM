#!/usr/bin/env node
/**
 * Claude Code SessionStart hook: install dependencies in a fresh checkout without blocking.
 *
 * Worktrees the desktop app creates (.claude/worktrees/<name>) start with no node_modules, and a
 * cold `bun install` takes ~3.5 min on Windows. When node_modules is missing this starts the
 * install as a detached background process and tells the agent where its log is, so the session
 * can read code while it runs. It also speaks up while that install is still running, and retries
 * one that failed or was interrupted. A checkout this hook never installed (the main checkout,
 * any with node_modules and no log here) gets no output.
 *
 *   node .claude/hooks/session-start.mjs                 hook entry point
 *   node .claude/hooks/session-start.mjs install         the detached runner (internal)
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
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
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
const key = createHash("sha1").update(projectDir).digest("hex").slice(0, 12);
const stateDir = join(tmpdir(), "solomindlm-claude-hooks");
const lockPath = join(stateDir, `${key}-install.lock`);
const logPath = join(stateDir, `${key}-install.log`);
const DONE_MARKER = "bun install finished";
const SUCCESS_LINE = `${DONE_MARKER} (exit 0)`;
// The lock holds the runner's PID ("pending" for the instant before it is spawned). It is live
// while that process is; the age cap only guards against the PID being reused after a crash.
const PENDING = "pending";
const PENDING_MAX_MS = 60 * 1000;
const PID_REUSE_MAX_MS = 3 * 60 * 60 * 1000;

/** The lock's owner and age, or null when there is no lock. */
function readLock() {
  try {
    return {
      owner: readFileSync(lockPath, "utf8").trim(),
      ageMs: Date.now() - statSync(lockPath).mtimeMs,
    };
  } catch {
    return null;
  }
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM"; // Exists but belongs to someone else.
  }
}

function lockLive(lock) {
  if (!lock) return false;
  if (lock.owner === PENDING || lock.owner === "") return lock.ageMs <= PENDING_MAX_MS;
  const pid = Number(lock.owner);
  return Number.isInteger(pid) && processAlive(pid) && lock.ageMs <= PID_REUSE_MAX_MS;
}

/** Removes the lock only if it still names `owner` — never a lock someone else took since. */
function releaseLock(owner) {
  if (readLock()?.owner === owner) rmSync(lockPath, { force: true });
}

/** Runs in the detached child: install, record the outcome in the log, release its own lock. */
function runInstall() {
  const result = spawnSync("bun", ["install", "--frozen-lockfile"], {
    cwd: projectDir,
    stdio: ["ignore", "inherit", "inherit"],
    windowsHide: true,
  });
  const status = result.error ? result.error.message : `exit ${result.status}`;
  appendFileSync(logPath, `\n${DONE_MARKER} (${status})\n`);
  // The parent may not have swapped "pending" for our PID yet; that lock is ours either way.
  releaseLock(String(process.pid));
  releaseLock(PENDING);
}

/** A live lock means our install is mid-run; bun creates node_modules long before it finishes. */
function installRunning() {
  return lockLive(readLock());
}

/** This hook installed here before, and that install failed or never finished (stale lock). */
function lastInstallFailed() {
  if (!existsSync(logPath)) return false;
  return !readFileSync(logPath, "utf8").trimEnd().endsWith(SUCCESS_LINE);
}

/** Starts the detached runner unless one is already running for this checkout. */
function startInstall() {
  mkdirSync(stateDir, { recursive: true });
  const seen = readLock();
  if (seen && !lockLive(seen)) releaseLock(seen.owner); // Dead runner: reclaim its lock only.
  let fd;
  try {
    fd = openSync(lockPath, "wx");
  } catch {
    return; // An install for this checkout is already running (e.g. /clear mid-install).
  }
  writeFileSync(fd, PENDING);
  closeSync(fd);
  rmSync(logPath, { force: true });
  const log = openSync(logPath, "a");
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "install"], {
    cwd: projectDir,
    detached: true,
    stdio: ["ignore", log, log],
    windowsHide: true,
  });
  if (child.pid) writeFileSync(lockPath, String(child.pid));
  // A launch failure arrives as an event, not a throw. Leave no lock claiming a running install.
  child.on("error", (error) => {
    appendFileSync(logPath, `\n${DONE_MARKER} (could not start: ${error.message})\n`);
    releaseLock(PENDING);
  });
  child.unref();
  closeSync(log);
}

if (process.argv[2] === "install") {
  runInstall();
} else {
  let reason = null;
  if (installRunning()) reason = "are being installed";
  else if (!existsSync(join(projectDir, "node_modules"))) reason = "are missing";
  else if (lastInstallFailed()) reason = "did not finish installing last time";
  if (reason) {
    startInstall();
    // SessionStart stdout is added to the agent's context.
    process.stdout.write(
      `This checkout's dependencies ${reason}, so \`bun install\` is running in the background (log: ${logPath}). ` +
        `Read and plan freely, but before running any bun/bunx/vitest/tsgo command wait for the log's last line, "${SUCCESS_LINE}". ` +
        "If it reports another exit code or an error, fix the install before running those commands. " +
        "Do not start a second `bun install` while it runs.\n"
    );
  }
}
