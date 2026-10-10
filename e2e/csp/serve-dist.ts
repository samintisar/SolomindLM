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
import { vercelGlobalHeaders, vercelRoutes } from "./vercelHeaders";

const repoRoot = process.cwd();
const distDir = path.resolve(repoRoot, "apps/web/dist");
const port = Number(process.env.CSP_SERVER_PORT ?? 4173);

if (!existsSync(path.join(distDir, "index.html"))) {
  console.error(`[serve-dist] ${distDir}/index.html not found. Run the web build first.`);
  process.exit(1);
}

const vercelJson = path.resolve(repoRoot, "apps/web/vercel.json");
const globalHeaders = vercelGlobalHeaders(vercelJson);

// After `handle: filesystem`, vercel.json sends the SPA routes to /index.html and everything
// else to 404.html with status 404. Vercel anchors each `src` pattern.
const routes = vercelRoutes(vercelJson);
const spaRoutes = routes
  .slice(routes.findIndex((route) => route.handle === "filesystem") + 1)
  .filter((route) => route.src && route.dest === "/index.html")
  .map((route) => new RegExp(`^${route.src}$`));

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

function resolveFile(urlPath: string): { file: string; status: number } | null {
  const decoded = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  const candidate = path.join(distDir, decoded);
  // Block path traversal out of dist.
  if (!candidate.startsWith(distDir)) return null;
  if (existsSync(candidate) && statSync(candidate).isFile())
    return { file: candidate, status: 200 };
  const asIndex = path.join(candidate, "index.html");
  if (existsSync(asIndex)) return { file: asIndex, status: 200 };
  if (spaRoutes.some((route) => route.test(decoded))) {
    return { file: path.join(distDir, "index.html"), status: 200 };
  }
  const notFound = path.join(distDir, "404.html");
  return existsSync(notFound) ? { file: notFound, status: 404 } : null;
}

createServer((req, res) => {
  // CSP reports go to Convex in production; accept and discard them here.
  if (req.method === "POST") {
    res.writeHead(204, globalHeaders);
    res.end();
    return;
  }
  const resolved = resolveFile(req.url ?? "/");
  if (!resolved) {
    res.writeHead(404, globalHeaders);
    res.end("Not found");
    return;
  }
  res.writeHead(resolved.status, {
    ...globalHeaders,
    "Content-Type": contentTypes[path.extname(resolved.file)] ?? "application/octet-stream",
  });
  res.end(readFileSync(resolved.file));
}).listen(port, () => {
  console.log(`[serve-dist] http://localhost:${port} (headers from apps/web/vercel.json)`);
});
