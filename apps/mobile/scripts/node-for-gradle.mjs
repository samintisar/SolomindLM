/**
 * Node wrapper for Android Gradle / Expo autolinking on Windows.
 * Rewrites Bun `.bun/.../node_modules/pkg` paths to hoisted `node_modules/pkg`
 * and maps the repo to SOLOMINDLM_REPO_ROOT (SUBST drive) for shorter CMake paths.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

const realNode = process.env.NODE_BINARY_REAL ?? process.env.NODE_BINARY ?? "node";
const substRoot = process.env.SOLOMINDLM_REPO_ROOT?.replace(/\\/g, "/").replace(/\/$/, "");
const realRoot = process.env.SOLOMINDLM_REPO_ROOT_REAL?.replace(/\\/g, "/").replace(/\/$/, "");

const bunStoreSegment = /[\\/]node_modules[\\/]\.bun[\\/][^\\/]+[\\/]node_modules[\\/]/gi;

function shortenPaths(text) {
  if (!text) return text;
  let out = text;
  if (realRoot && substRoot) {
    const realWin = realRoot.replace(/\//g, "\\");
    const realFwd = realRoot.replace(/\\/g, "/");
    out = out.split(realWin).join(substRoot.replace(/\//g, "\\"));
    out = out.split(realFwd).join(substRoot);
  }
  out = out.replace(bunStoreSegment, "/node_modules/");
  out = out.replace(bunStoreSegment, "\\node_modules\\");
  return out;
}

const args = process.argv.slice(2);
const result = spawnSync(realNode, args, {
  encoding: "utf8",
  env: process.env,
  maxBuffer: 10 * 1024 * 1024,
});

if (result.stdout) process.stdout.write(shortenPaths(result.stdout));
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 1);
