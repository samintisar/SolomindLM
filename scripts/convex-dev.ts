#!/usr/bin/env bun

/**
 * `bun run dev:convex [convex dev args]` — `convex dev`, but refuses to start a
 * second watcher on a cloud dev deployment that another checkout (any git
 * worktree) is already watching, since the two would overwrite each other's
 * functions on every save. See convexDevLock.ts.
 *
 * `--once` pushes always go through. `--force` takes over a lock you know is
 * stale (e.g. its PID was reused after a crash).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  type DevLock,
  deploymentFromEnv,
  isWatchCommand,
  liveHolder,
  lockFileName,
  needsLock,
} from "./convexDevLock";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function readLock(file: string): DevLock | null {
  try {
    const lock = JSON.parse(readFileSync(file, "utf-8"));
    return Number.isInteger(lock.pid) ? lock : null;
  } catch {
    return null;
  }
}

function readDeployment(root: string): string | null {
  if (process.env.CONVEX_DEPLOYMENT) return process.env.CONVEX_DEPLOYMENT;
  try {
    return deploymentFromEnv(readFileSync(path.join(root, ".env.local"), "utf-8"));
  } catch {
    return null;
  }
}

/** Takes the lock, or exits explaining who holds it. Returns the lock file path. */
function acquireLock(root: string, deployment: string, force: boolean): string {
  const dir = path.join(
    git(root, "rev-parse", "--path-format=absolute", "--git-common-dir"),
    "convex-dev"
  );
  const file = path.join(dir, lockFileName(deployment));
  const holder = liveHolder(readLock(file), process.pid, isAlive);

  if (holder && !force) {
    console.error(
      [
        `convex dev is already watching ${deployment} from ${holder.root}`,
        `(PID ${holder.pid}, since ${holder.startedAt}).`,
        "",
        "A second watcher would overwrite that checkout's functions on every save.",
        "  • Push this checkout once:   bun run dev:convex --once",
        "  • Or stop the other watcher, then run this again.",
        "  • Lock stale (PID reused)?   bun run dev:convex --force",
      ].join("\n")
    );
    process.exit(1);
  }

  mkdirSync(dir, { recursive: true });
  const lock: DevLock = { pid: process.pid, root, deployment, startedAt: new Date().toISOString() };
  writeFileSync(file, `${JSON.stringify(lock, null, 2)}\n`);
  return file;
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const convexArgs = args.filter((a) => a !== "--force");
  const root = git(process.cwd(), "rev-parse", "--path-format=absolute", "--show-toplevel");
  const deployment = readDeployment(root);

  let lockFile: string | null = null;
  if (isWatchCommand(convexArgs) && needsLock(deployment)) {
    lockFile = acquireLock(root, deployment as string, force);
  }

  const child = Bun.spawn([process.execPath, "x", "convex", "dev", ...convexArgs], {
    cwd: root,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  // Ctrl+C reaches convex too; wait for it to exit, then release the lock.
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      if (process.platform !== "win32") child.kill(signal);
    });
  }
  const code = await child.exited;
  if (lockFile && readLock(lockFile)?.pid === process.pid) rmSync(lockFile, { force: true });
  process.exit(code);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
