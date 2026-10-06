#!/usr/bin/env bun

/**
 * Starts this checkout's web (Vite) or mobile (Expo/Metro) dev server on a port
 * of its own, so several worktrees can run servers at once.
 *
 *   bun run scripts/dev-server.ts web
 *   bun run scripts/dev-server.ts mobile [expo start args, e.g. --android]
 *
 * Port: `PORT` (set by the Claude preview pane when it picks a port) or
 * `WEB_PORT` / `METRO_PORT` pins it; otherwise the checkout's preferred port from
 * devPorts.ts, moving on to the next free one if something else holds it.
 *
 * Stale servers: the PID of the server it starts is recorded in
 * `<checkout>/.dev-servers/<server>.json`. On the next start, that PID is killed
 * only if it is still listening on the recorded port, so a leftover server from
 * this checkout is cleaned up while other worktrees' servers are never touched.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import {
  type DevServer,
  detectCheckout,
  portCandidates,
  readServerState,
  rewriteWebUrlPort,
  serverStatePath,
} from "./devPorts";

const isWindows = process.platform === "win32";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function canConnect(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    socket.setTimeout(300);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

function canListen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, () => server.close(() => resolve(true)));
  });
}

async function isPortFree(port: number): Promise<boolean> {
  if ((await canConnect(port, "127.0.0.1")) || (await canConnect(port, "::1"))) return false;
  return canListen(port);
}

async function run(cmd: string[]): Promise<string> {
  try {
    const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "ignore" });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    return out;
  } catch {
    return "";
  }
}

/** PIDs listening on `port`. */
async function listenerPids(port: number): Promise<number[]> {
  const pids = new Set<number>();
  if (isWindows) {
    // Columns: Proto, Local Address, Foreign Address, State, PID (IPv4 and IPv6).
    for (const line of (await run(["netstat", "-ano"])).split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/);
      if (parts[3] === "LISTENING" && parts[1]?.endsWith(`:${port}`)) {
        pids.add(Number(parts[4]));
      }
    }
  } else {
    for (const pid of (await run(["lsof", "-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"])).split(
      "\n"
    )) {
      if (/^\d+$/.test(pid.trim())) pids.add(Number(pid.trim()));
    }
  }
  pids.delete(0);
  return [...pids];
}

async function killTree(pid: number): Promise<void> {
  if (isWindows) {
    await run(["taskkill", "/T", "/F", "/PID", String(pid)]);
  } else {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
}

/** Kill this checkout's leftover server, if the recorded PID still holds its port. */
async function stopStaleServer(root: string, server: DevServer): Promise<void> {
  const state = readServerState(root, server);
  if (!state) return;
  if ((await listenerPids(state.port)).includes(state.pid)) {
    console.log(
      `Stopping this checkout's previous ${server} server (PID ${state.pid}, port ${state.port})`
    );
    await killTree(state.pid);
    for (let i = 0; i < 20 && !(await isPortFree(state.port)); i++) await sleep(250);
  }
  rmSync(serverStatePath(root, server), { force: true });
}

function pinnedPort(server: DevServer): number | null {
  const raw =
    server === "web"
      ? (process.env.PORT ?? process.env.WEB_PORT)
      : (process.env.METRO_PORT ?? process.env.RCT_METRO_PORT);
  if (!raw) return null;
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`Invalid port "${raw}"`);
  return port;
}

/**
 * Fail before stopping anything when a pinned port belongs to someone else, so a
 * bad pin doesn't take down this checkout's running server for nothing.
 */
async function assertPinnedPortUsable(server: DevServer, root: string): Promise<void> {
  const pinned = pinnedPort(server);
  if (!pinned || (await isPortFree(pinned))) return;
  const own = readServerState(root, server);
  if (own?.port === pinned && (await listenerPids(pinned)).includes(own.pid)) return;
  throw new Error(`Port ${pinned} is in use by another process (it was pinned via env).`);
}

async function choosePort(server: DevServer, checkout: ReturnType<typeof detectCheckout>) {
  const pinned = pinnedPort(server);
  if (pinned) {
    if (!(await isPortFree(pinned))) {
      throw new Error(`Port ${pinned} is in use by another process (it was pinned via env).`);
    }
    return pinned;
  }
  const candidates = portCandidates(server, checkout);
  for (const port of candidates) {
    if (await isPortFree(port)) {
      if (port !== candidates[0]) {
        console.log(`Port ${candidates[0]} is taken by another process; using ${port}.`);
      }
      return port;
    }
  }
  throw new Error(`No free ${server} dev port in ${candidates[0]}-${candidates.at(-1)}.`);
}

/** `EXPO_PUBLIC_WEB_URL` from the environment or apps/mobile/.env.local. */
function mobileWebUrl(mobileDir: string): string | undefined {
  if (process.env.EXPO_PUBLIC_WEB_URL) return process.env.EXPO_PUBLIC_WEB_URL;
  try {
    const line = readFileSync(path.join(mobileDir, ".env.local"), "utf-8")
      .split(/\r?\n/)
      .find((l) => l.trim().startsWith("EXPO_PUBLIC_WEB_URL="));
    return line?.split("=").slice(1).join("=").trim();
  } catch {
    return undefined;
  }
}

async function main() {
  const [server, ...extraArgs] = process.argv.slice(2);
  if (server !== "web" && server !== "mobile") {
    console.error("Usage: dev-server.ts <web|mobile> [args]");
    process.exit(1);
  }

  const checkout = detectCheckout(process.cwd());
  await assertPinnedPortUsable(server, checkout.root);
  await stopStaleServer(checkout.root, server);
  const port = await choosePort(server, checkout);
  const env: Record<string, string | undefined> = { ...process.env };
  let cwd: string;
  let cmd: string[];

  if (server === "web") {
    cwd = path.join(checkout.root, "apps", "web");
    cmd = [process.execPath, "x", "vite", "--port", String(port), "--strictPort", ...extraArgs];
  } else {
    cwd = path.join(checkout.root, "apps", "mobile");
    cmd = [process.execPath, "x", "expo", "start", "--port", String(port), ...extraArgs];
    env.NODE_OPTIONS = [env.NODE_OPTIONS, "--max-old-space-size=8192"].filter(Boolean).join(" ");
    // The WebView should load this checkout's web server, not the main one's.
    const webUrl = mobileWebUrl(cwd);
    if (webUrl) {
      const webPort =
        readServerState(checkout.root, "web")?.port ?? portCandidates("web", checkout)[0];
      env.EXPO_PUBLIC_WEB_URL = rewriteWebUrlPort(webUrl, webPort);
      if (env.EXPO_PUBLIC_WEB_URL !== webUrl) {
        console.log(`WebView → ${env.EXPO_PUBLIC_WEB_URL} (this checkout's web server)`);
      }
    }
  }

  const where = checkout.isMain ? "main checkout" : `worktree ${path.basename(checkout.root)}`;
  console.log(`Starting ${server} dev server for ${where} on port ${port}`);

  const child = Bun.spawn(cmd, {
    cwd,
    env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const stateFile = serverStatePath(checkout.root, server);
  const cleanup = () => {
    if (readServerState(checkout.root, server)?.port === port) rmSync(stateFile, { force: true });
  };

  // Record the listening PID once the server is up, for stale cleanup next time.
  void (async () => {
    for (let i = 0; i < 240 && child.exitCode === null; i++) {
      const pids = await listenerPids(port);
      if (pids.length > 0) {
        mkdirSync(path.dirname(stateFile), { recursive: true });
        writeFileSync(stateFile, `${JSON.stringify({ pid: pids[0], port })}\n`);
        return;
      }
      await sleep(500);
    }
  })();

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      // Ctrl+C reaches the child too; wait for it so its exit is clean.
      if (!isWindows) child.kill(signal);
    });
  }

  const code = await child.exited;
  cleanup();
  process.exit(code);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
