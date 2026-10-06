import { describe, expect, it } from "vitest";
import {
  type DevLock,
  deploymentFromEnv,
  isWatchCommand,
  liveHolder,
  lockFileName,
  needsLock,
} from "./convexDevLock";

const lock = (pid: number): DevLock => ({
  pid,
  root: "C:/repo/.worktrees/a",
  deployment: "dev:happy-cat-123",
  startedAt: "2026-10-05T12:00:00.000Z",
});

describe("deploymentFromEnv", () => {
  it("reads CONVEX_DEPLOYMENT and drops the trailing comment", () => {
    const env = "VITE_X=1\nCONVEX_DEPLOYMENT=dev:happy-cat-123 # team: me, project: app\n";
    expect(deploymentFromEnv(env)).toBe("dev:happy-cat-123");
  });

  it("strips quotes and CRLF", () => {
    expect(deploymentFromEnv('CONVEX_DEPLOYMENT="dev:happy-cat-123"\r\n')).toBe(
      "dev:happy-cat-123"
    );
  });

  it("ignores commented-out lines", () => {
    expect(deploymentFromEnv("# CONVEX_DEPLOYMENT=dev:old\n")).toBeNull();
  });
});

describe("isWatchCommand", () => {
  it("treats plain `convex dev` as the long-running watcher", () => {
    expect(isWatchCommand([])).toBe(true);
    expect(isWatchCommand(["--typecheck", "disable"])).toBe(true);
  });

  it("lets one-shot pushes and help through", () => {
    expect(isWatchCommand(["--once"])).toBe(false);
    expect(isWatchCommand(["--help"])).toBe(false);
  });
});

describe("needsLock", () => {
  it("guards shared cloud dev deployments", () => {
    expect(needsLock("dev:happy-cat-123")).toBe(true);
  });

  it("skips local deployments, which belong to one checkout", () => {
    expect(needsLock("local:local-me-app")).toBe(false);
    expect(needsLock("anonymous:anonymous-app")).toBe(false);
  });

  it("skips a checkout with no deployment configured yet", () => {
    expect(needsLock(null)).toBe(false);
  });
});

describe("liveHolder", () => {
  it("reports a lock whose process is still running", () => {
    expect(liveHolder(lock(41), 99, () => true)).toEqual(lock(41));
  });

  it("ignores a stale lock from a process that has exited", () => {
    expect(liveHolder(lock(41), 99, () => false)).toBeNull();
  });

  it("ignores no lock and its own lock", () => {
    expect(liveHolder(null, 99, () => true)).toBeNull();
    expect(liveHolder(lock(99), 99, () => true)).toBeNull();
  });
});

describe("lockFileName", () => {
  it("makes a filesystem-safe name per deployment", () => {
    expect(lockFileName("dev:happy-cat-123")).toBe("dev_happy-cat-123.json");
  });
});
