/**
 * Static server for the CSP smoke test: serves apps/web/dist with the same response
 * headers Vercel applies from apps/web/vercel.json, so the policy under test is the
 * one that ships. `vite preview` ignores vercel.json, which is why this exists.
 *
 * Run by playwright.csp.config.ts (webServer). Build first: `bun run build:prod`.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { vercelGlobalHeaders } from "./vercelHeaders";

const repoRoot = process.cwd();
const distDir = path.resolve(repoRoot, "apps/web/dist");
const port = Number(process.env.CSP_SERVER_PORT ?? 4173);

if (!existsSync(path.join(distDir, "index.html"))) {
  console.error(`[serve-dist] ${distDir}/index.html not found. Run the web build first.`);
  process.exit(1);
}

const globalHeaders = vercelGlobalHeaders(repoRoot);

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".wasm": "application/wasm",
};

function resolveFile(urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  const candidate = path.join(distDir, decoded);
  // Block path traversal out of dist.
  if (!candidate.startsWith(distDir)) return null;
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  const asIndex = path.join(candidate, "index.html");
  if (existsSync(asIndex)) return asIndex;
  // SPA fallback for extension-less client routes (/sign-in, /notebook/:id, ...).
  if (!path.extname(decoded)) return path.join(distDir, "index.html");
  return null;
}

createServer((req, res) => {
  // CSP reports go to Convex in production; accept and discard them here.
  if (req.method === "POST") {
    res.writeHead(204, globalHeaders);
    res.end();
    return;
  }
  const file = resolveFile(req.url ?? "/");
  if (!file) {
    res.writeHead(404, globalHeaders);
    res.end("Not found");
    return;
  }
  res.writeHead(200, {
    ...globalHeaders,
    "Content-Type": contentTypes[path.extname(file)] ?? "application/octet-stream",
  });
  res.end(readFileSync(file));
}).listen(port, () => {
  console.log(`[serve-dist] http://localhost:${port} (headers from apps/web/vercel.json)`);
});
