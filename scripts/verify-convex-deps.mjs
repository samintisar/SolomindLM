/**
 * Verifies Convex + component packages resolve from repo root node_modules.
 * Run after bun install if `convex dev` reports missing @auth/core or convex.config.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const packages = [
  "@auth/core",
  "@convex-dev/action-cache/convex.config",
  "@convex-dev/persistent-text-streaming/convex.config",
  "@convex-dev/rate-limiter/convex.config.js",
  "@convex-dev/stripe/convex.config.js",
  "@convex-dev/workflow/convex.config.js",
  "convex/server",
];

let failed = false;
for (const pkg of packages) {
  try {
    const resolved = require.resolve(pkg, { paths: [root] });
    console.log(`OK  ${pkg}\n    → ${resolved}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL ${pkg}\n    → ${error instanceof Error ? error.message : error}`);
  }
}

if (failed) {
  console.error(
    "\nnode_modules is incomplete or corrupted. From repo root run:\n" +
      "  Remove-Item -Recurse -Force node_modules, apps\\web\\node_modules, apps\\mobile\\node_modules\n" +
      "  bun install --force\n"
  );
  process.exit(1);
}

console.log("\nAll Convex dependency paths resolve.");
