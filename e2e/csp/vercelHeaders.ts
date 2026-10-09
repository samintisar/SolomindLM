import { readFileSync } from "node:fs";
import path from "node:path";

type Route = { src?: string; headers?: Record<string, string>; continue?: boolean };

/**
 * The headers apps/web/vercel.json adds to every response: the catch-all `continue: true`
 * route. vercel.json uses legacy `routes`, so these live on a route entry rather than in a
 * top-level `headers` block (which Vercel ignores next to `routes`).
 */
export function vercelGlobalHeaders(repoRoot = process.cwd()): Record<string, string> {
  const config = JSON.parse(
    readFileSync(path.resolve(repoRoot, "apps/web/vercel.json"), "utf-8")
  ) as { routes?: Route[] };
  const route = (config.routes ?? []).find(
    (entry) => entry.src === "/(.*)" && entry.continue === true && entry.headers
  );
  return { ...route?.headers };
}
