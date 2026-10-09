/**
 * Checks that a deployed site actually sends the headers from apps/web/vercel.json, and that
 * routing still behaves: public pages, a prerendered SEO page, an SPA route and a static file
 * return 200, and an unknown path returns 404. The static guard (csp.test.ts) and the CSP smoke
 * test (serve-dist.ts) both read vercel.json themselves, so neither notices when Vercel ignores
 * the headers; only a real deployment can show that.
 *
 *   bun run test:deployed-headers https://<deployment>.vercel.app
 *
 * Preview deployments sit behind Vercel Authentication: set VERCEL_AUTOMATION_BYPASS_SECRET
 * (Project Settings → Deployment Protection → Protection Bypass for Automation). The secret is
 * only ever sent over HTTPS to this project's own hosts (DEPLOYMENT_HOSTS).
 *
 * VERCEL_JSON points at the vercel.json to compare against (default: this checkout's). CI runs
 * this script from main and passes the deployed commit's vercel.json, which is only parsed.
 */
import path from "node:path";
import { vercelGlobalHeaders } from "./vercelHeaders";

/** Hosts that may receive the bypass secret: production and this project's Vercel URLs. */
const DEPLOYMENT_HOSTS = [
  /^www\.solomindlm\.com$/,
  /^solomindlm-(?:web-)?[a-z0-9-]+-samintisars-projects\.vercel\.app$/,
];

const CHECKS: { path: string; status: number }[] = [
  { path: "/", status: 200 },
  { path: "/faq", status: 200 },
  { path: "/students/ai-flashcards", status: 200 },
  { path: "/home", status: 200 },
  { path: "/robots.txt", status: 200 },
  { path: "/__deployed-headers-check-not-found", status: 404 },
];

const rawUrl = process.argv[2] ?? process.env.DEPLOYMENT_URL;
if (!rawUrl) {
  console.error("usage: bun e2e/csp/check-deployed-headers.ts <deployment-url>");
  process.exit(2);
}
const baseUrl = new URL(rawUrl);

const configPath = path.resolve(process.env.VERCEL_JSON ?? "apps/web/vercel.json");
const expected = vercelGlobalHeaders(configPath);
if (Object.keys(expected).length === 0) {
  console.error(`No catch-all headers route found in ${configPath}`);
  process.exit(1);
}

const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
if (
  bypass &&
  (baseUrl.protocol !== "https:" || !DEPLOYMENT_HOSTS.some((host) => host.test(baseUrl.hostname)))
) {
  console.error(`Refusing to send the bypass secret to ${baseUrl.origin}`);
  process.exit(1);
}
const requestHeaders: Record<string, string> = bypass
  ? { "x-vercel-protection-bypass": bypass }
  : {};

const failures: string[] = [];
for (const { path, status } of CHECKS) {
  const url = new URL(path, baseUrl);
  const response = await fetch(url, { headers: requestHeaders, redirect: "manual" });
  await response.body?.cancel();
  const problems: string[] = [];
  if (response.status !== status) problems.push(`status ${response.status}, expected ${status}`);
  for (const [key, value] of Object.entries(expected)) {
    const actual = response.headers.get(key);
    if (actual === null) problems.push(`missing ${key}`);
    else if (actual !== value) problems.push(`${key} differs from vercel.json`);
  }
  console.log(`${problems.length ? "FAIL" : "ok  "} ${response.status} ${path}`);
  for (const problem of problems) failures.push(`${path}: ${problem}`);
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n${failures.map((f) => `  ${f}`).join("\n")}`);
  if (!bypass && failures.some((f) => f.includes("status 401") || f.includes("status 302"))) {
    console.error("Looks like Deployment Protection; set VERCEL_AUTOMATION_BYPASS_SECRET.");
  }
  process.exit(1);
}
console.log(`\nAll ${CHECKS.length} paths send the vercel.json headers.`);
