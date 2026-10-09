import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// Shared with the CSP smoke server and the deployed-headers check, so all three agree on
// which route carries the headers.
import { isGlobalHeadersRoute, type VercelRoute } from "../../../../../e2e/csp/vercelHeaders";

/**
 * Static guard for the security headers in apps/web/vercel.json.
 *
 * Headers only exist on a deployed site, so unit tests and `vite build` never see them.
 * This catches the cheap regressions (a loosened policy, a new third-party script that the
 * policy doesn't allow, headers declared where Vercel ignores them) at PR time;
 * e2e/csp/csp.spec.ts covers the live page behaviour and e2e/csp/check-deployed-headers.ts
 * the headers a real deployment sends.
 */

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const vercelConfig = JSON.parse(readFileSync(path.join(webRoot, "vercel.json"), "utf-8")) as {
  routes?: VercelRoute[];
} & Record<string, unknown>;
const indexHtml = readFileSync(path.join(webRoot, "index.html"), "utf-8");
const routes = vercelConfig.routes ?? [];

const CSP_HEADERS = ["content-security-policy", "content-security-policy-report-only"];

// The legacy `routes` array can't be combined with these: Vercel drops them without a build
// error, which is how the security headers went missing in production.
const ROUTE_ONLY_CONFLICTS = ["headers", "redirects", "rewrites", "cleanUrls", "trailingSlash"];

const headersRouteIndex = routes.findIndex(isGlobalHeadersRoute);
const globalHeaders = Object.fromEntries(
  Object.entries(routes[headersRouteIndex]?.headers ?? {}).map(([key, value]) => [
    key.toLowerCase(),
    value,
  ])
);

function cspHeaderValue(): string | undefined {
  // Prefer the enforcing header when both are present.
  for (const name of CSP_HEADERS) {
    if (globalHeaders[name]) return globalHeaders[name];
  }
  return undefined;
}

function parsePolicy(policy: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const part of policy.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) directives.set(name.toLowerCase(), sources);
  }
  return directives;
}

const policy = cspHeaderValue();
const directives = parsePolicy(policy ?? "");

describe("vercel.json security headers", () => {
  it("does not mix legacy routes with keys Vercel ignores alongside them", () => {
    const conflicts = ROUTE_ONLY_CONFLICTS.filter((key) => key in vercelConfig);
    expect(conflicts, "express these as entries in `routes` (headers: continue: true)").toEqual([]);
  });

  it("are added by a catch-all continue route before the filesystem handler", () => {
    const filesystemIndex = routes.findIndex((route) => route.handle === "filesystem");
    expect(
      headersRouteIndex,
      'add { "src": "/(.*)", "headers": {...}, "continue": true }'
    ).toBeGreaterThanOrEqual(0);
    expect(filesystemIndex, 'vercel.json needs { "handle": "filesystem" }').toBeGreaterThanOrEqual(
      0
    );
    // Routes after `handle: filesystem` never run for static files (/, /faq, /assets/*).
    expect(headersRouteIndex).toBeLessThan(filesystemIndex);
  });

  it("forbid MIME sniffing and framing", () => {
    expect(globalHeaders["x-content-type-options"]).toBe("nosniff");
    expect(globalHeaders["x-frame-options"]).toBe("DENY");
  });
});

describe("vercel.json Content-Security-Policy", () => {
  it("is set for every route", () => {
    expect(policy, "add a Content-Security-Policy[-Report-Only] header for /(.*)").toBeTruthy();
  });

  it("locks down the non-fetch directives", () => {
    expect(directives.get("default-src")).toEqual(["'self'"]);
    expect(directives.get("object-src")).toEqual(["'none'"]);
    expect(directives.get("base-uri")).toEqual(["'self'"]);
    expect(directives.get("frame-ancestors")).toEqual(["'none'"]);
  });

  it("does not allow inline or eval script execution", () => {
    const scriptSrc = directives.get("script-src") ?? [];
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it("reports violations to a route that exists in convex/http.ts", () => {
    // report-uri (not report-to) because Firefox and Safari only honour the former.
    const [target, ...rest] = directives.get("report-uri") ?? [];
    expect(rest).toHaveLength(0);
    expect(target, "add report-uri /api/csp-report to the policy").toBe("/api/csp-report");
    // Vercel proxies /api/* to Convex, so the route must be registered at exactly this path.
    const convexHttp = readFileSync(path.join(webRoot, "../../convex/http.ts"), "utf-8");
    expect(convexHttp).toContain(`path: "${target}"`);
  });

  it("has no bare wildcard sources", () => {
    for (const [directive, sources] of directives) {
      expect(sources, `${directive} must not allow every origin`).not.toContain("*");
    }
  });

  it("has no inline <script> in index.html", () => {
    const inline = [...indexHtml.matchAll(/<script\b([^>]*)>/gi)].filter(
      ([, attrs]) =>
        !/\bsrc\s*=/.test(attrs) && !/type\s*=\s*["']application\/ld\+json["']/.test(attrs)
    );
    expect(inline, "move inline scripts to apps/web/public/*.js").toHaveLength(0);
  });

  it("allows every external script origin that index.html loads", () => {
    const scriptSrc = directives.get("script-src") ?? [];
    const origins = [
      ...indexHtml.matchAll(/<script\b[^>]*\bsrc\s*=\s*["'](https?:\/\/[^"']+)["']/gi),
    ].map(([, src]) => new URL(src).origin);
    expect(origins.length).toBeGreaterThan(0);
    for (const origin of origins) {
      expect(scriptSrc, `script-src is missing ${origin}`).toContain(origin);
    }
  });
});
