import { readFileSync } from "node:fs";
import path from "node:path";

export type VercelRoute = {
  src?: string;
  dest?: string;
  status?: number;
  handle?: string;
  headers?: Record<string, string>;
  continue?: boolean;
};

/** The catch-all `continue: true` route that adds headers to every response. */
export function isGlobalHeadersRoute(route: VercelRoute): boolean {
  return route.src === "/(.*)" && route.continue === true && route.headers !== undefined;
}

/** The `routes` array of a vercel.json. Only parses the file, never executes it. */
export function vercelRoutes(configPath: string): VercelRoute[] {
  const config = JSON.parse(readFileSync(configPath, "utf-8")) as { routes?: VercelRoute[] };
  return config.routes ?? [];
}

/**
 * The headers apps/web/vercel.json adds to every response: the catch-all `continue: true`
 * route. vercel.json uses legacy `routes`, so these live on a route entry rather than in a
 * top-level `headers` block (which Vercel ignores next to `routes`).
 *
 * Only reads the file as JSON, so it is safe to point at a vercel.json from an untrusted commit.
 */
export function vercelGlobalHeaders(
  configPath = path.resolve(process.cwd(), "apps/web/vercel.json")
): Record<string, string> {
  return { ...vercelRoutes(configPath).find(isGlobalHeadersRoute)?.headers };
}
