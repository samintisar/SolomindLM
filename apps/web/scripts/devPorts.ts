/**
 * Port assignment for local dev servers, so every git worktree can run its own
 * web (Vite) and mobile (Metro) server side by side.
 *
 * The main checkout keeps the classic ports (5173 / 8081). A linked worktree
 * gets a stable port derived from its path, inside a fixed range, and never the
 * main checkout's port. The web range must stay in sync with `DEV_WEB_PORTS` in
 * `convex/_lib/allowedOrigins.ts`, which is what lets Convex CORS accept it.
 *
 * Node-only APIs (no Bun) so `playwright.config.ts` can import it too.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type DevServer = "web" | "mobile";

export const DEV_PORT_RANGES: Record<DevServer, { first: number; last: number }> = {
  web: { first: 5173, last: 5199 },
  mobile: { first: 8081, last: 8107 },
};

export interface Checkout {
  /** True for the main checkout, false for a linked worktree. */
  isMain: boolean;
  /** Absolute path of the checkout root; hashed to pick a worktree's port. */
  key: string;
}

/** FNV-1a, so the same path always maps to the same port. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Ports to try, in order: the checkout's preferred port, then the rest of the range. */
export function portCandidates(server: DevServer, checkout: Checkout): number[] {
  const { first, last } = DEV_PORT_RANGES[server];
  if (checkout.isMain) {
    return Array.from({ length: last - first + 1 }, (_, i) => first + i);
  }
  // Worktrees share first+1..last; the main checkout's port stays free for it.
  const slots = last - first;
  const start = hash(checkout.key.replace(/\\/g, "/").toLowerCase()) % slots;
  return Array.from({ length: slots }, (_, i) => first + 1 + ((start + i) % slots));
}

/**
 * Point a dev web URL (e.g. the mobile WebView's `EXPO_PUBLIC_WEB_URL`) at this
 * checkout's web port. URLs outside the web dev range are returned unchanged.
 */
export function rewriteWebUrlPort(url: string, port: number): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const current = Number(parsed.port);
  const { first, last } = DEV_PORT_RANGES.web;
  if (!current || current < first || current > last) return url;
  parsed.port = String(port);
  const rewritten = parsed.toString();
  // URL adds a trailing "/" to a bare origin; keep the caller's form.
  return url.endsWith("/") || parsed.pathname !== "/" ? rewritten : rewritten.replace(/\/$/, "");
}

/** Root of the checkout containing `cwd`, and whether it's the main checkout. */
export function detectCheckout(cwd: string): Checkout & { root: string } {
  const [root, gitDir, commonDir] = execFileSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-dir", "--git-common-dir"],
    { cwd, encoding: "utf-8" }
  )
    .trim()
    .split(/\r?\n/);
  return { root, key: root, isMain: path.resolve(gitDir) === path.resolve(commonDir) };
}

/** Where the launcher records the server it started for this checkout. */
export function serverStatePath(root: string, server: DevServer): string {
  return path.join(root, ".dev-servers", `${server}.json`);
}

export interface ServerState {
  /** PID of the process listening on `port`. */
  pid: number;
  port: number;
}

export function readServerState(root: string, server: DevServer): ServerState | null {
  const file = serverStatePath(root, server);
  if (!existsSync(file)) return null;
  try {
    const state = JSON.parse(readFileSync(file, "utf-8"));
    return Number.isInteger(state.pid) && Number.isInteger(state.port) ? state : null;
  } catch {
    return null;
  }
}

/** The web dev URL for the checkout at `cwd`: its running server, else its preferred port. */
export function webDevUrl(cwd: string): string {
  let port = DEV_PORT_RANGES.web.first;
  try {
    const checkout = detectCheckout(cwd);
    port = readServerState(checkout.root, "web")?.port ?? portCandidates("web", checkout)[0];
  } catch {
    // Not a git checkout (e.g. a source tarball): assume the classic port.
  }
  return `http://localhost:${port}`;
}
