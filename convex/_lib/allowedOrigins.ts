/**
 * Origin allowlist shared by HTTP CORS ([convex/http.ts]) and auth redirect
 * validation ([convex/auth.ts]).
 *
 * `SITE_URL` MUST be a single canonical origin. `@convex-dev/auth` feeds it
 * straight to `new URL()` when it builds email-verification links (the
 * no-`redirectTo` path in its `signIn` action), so a comma-joined value makes
 * every OTP / password-reset email throw before it is sent. Additional allowed
 * origins (extra dev hosts, an apex alongside `www`, staging) go in
 * `CORS_EXTRA_ORIGINS` as a comma-separated list.
 */

/** Fallback when `SITE_URL` is unset (local dev). */
export const DEFAULT_SITE_URL = "http://localhost:5173";

/**
 * Vite dev ports: 5173 for the main checkout, 5174-5199 for git worktrees.
 * Keep in sync with `DEV_PORT_RANGES.web` in `apps/web/scripts/devPorts.ts`.
 */
const DEV_WEB_PORTS = { first: 5173, last: 5199 };

/** Hosts a local Vite dev server is reached on (10.0.2.2 = Android emulator → host). */
const DEV_WEB_HOSTS = ["localhost", "127.0.0.1", "10.0.2.2"];

/** Dev origins that are always allowed, regardless of env. */
export const DEV_ORIGINS = DEV_WEB_HOSTS.flatMap((host) =>
  Array.from(
    { length: DEV_WEB_PORTS.last - DEV_WEB_PORTS.first + 1 },
    (_, i) => `http://${host}:${DEV_WEB_PORTS.first + i}`
  )
);

const stripTrailingSlash = (url: string): string => url.trim().replace(/\/$/, "");

/** The single canonical site origin, without a trailing slash. */
export function siteUrl(): string {
  return stripTrailingSlash(process.env.SITE_URL || DEFAULT_SITE_URL);
}

/** Extra allowed origins from `CORS_EXTRA_ORIGINS` (comma-separated). */
export function extraOrigins(): string[] {
  return (process.env.CORS_EXTRA_ORIGINS ?? "").split(",").map(stripTrailingSlash).filter(Boolean);
}

/** Full de-duped allowlist: dev origins + `SITE_URL` + `CORS_EXTRA_ORIGINS`. */
export function allowedOrigins(): string[] {
  return [...new Set([...DEV_ORIGINS, siteUrl(), ...extraOrigins()])];
}
