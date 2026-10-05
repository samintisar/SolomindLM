/**
 * One `convex dev` watcher per cloud dev deployment, across all git worktrees.
 *
 * Every worktree's `.env.local` points at the same dev deployment, and each
 * `convex dev` watcher pushes its own checkout's functions on every save, so two
 * watchers silently overwrite each other. `scripts/convex-dev.ts` takes a lock
 * (in the shared git dir, so every worktree sees it) before starting one.
 */

export interface DevLock {
  /** PID of the `scripts/convex-dev.ts` process holding the lock. */
  pid: number;
  /** Checkout the watcher runs in. */
  root: string;
  deployment: string;
  startedAt: string;
}

/** `CONVEX_DEPLOYMENT` from a `.env.local` file's text, or null when unset. */
export function deploymentFromEnv(text: string): string | null {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("CONVEX_DEPLOYMENT=")) continue;
    const value = line
      .slice("CONVEX_DEPLOYMENT=".length)
      .replace(/\s+#.*$/, "")
      .trim()
      .replace(/^["']|["']$/g, "");
    return value || null;
  }
  return null;
}

/** True for the long-running watcher; one-shot pushes (`--once`) and `--help` don't need the lock. */
export function isWatchCommand(args: string[]): boolean {
  return !args.some((a) => a === "--once" || a === "--help" || a === "-h");
}

/**
 * Only cloud dev deployments are shared between checkouts. Local and anonymous
 * deployments run on this machine per checkout; with nothing configured yet,
 * `convex dev` is about to set one up.
 */
export function needsLock(deployment: string | null): boolean {
  return deployment !== null && !/^(local|anonymous):/.test(deployment);
}

/** The lock's holder if it's another process that is still running, else null (free or stale). */
export function liveHolder(
  lock: DevLock | null,
  selfPid: number,
  isAlive: (pid: number) => boolean
): DevLock | null {
  if (!lock || lock.pid === selfPid || !isAlive(lock.pid)) return null;
  return lock;
}

export function lockFileName(deployment: string): string {
  return `${deployment.replace(/[^\w.-]/g, "_")}.json`;
}
