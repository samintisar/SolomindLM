/**
 * Bundles every evals/ module so a broken relative import or a missing named
 * export fails CI. Nothing typechecks evals/ yet (#311), and `bun run` strips
 * types without checking them, so otherwise these only surface when someone
 * runs an eval.
 *
 * `packages: "external"` leaves npm packages out but still resolves relative
 * imports and their named exports (a blanket `external: ["*"]` would skip
 * those too).
 *
 * Usage: bun run check:evals
 */
import { Glob } from "bun";

const entrypoints = [...new Glob("evals/**/*.ts").scanSync({ cwd: process.cwd() })]
  .filter((file) => !file.endsWith(".test.ts") && !file.endsWith(".d.ts"))
  .sort();

if (entrypoints.length === 0) {
  console.error("check:evals: no evals/**/*.ts modules found — run from the repo root");
  process.exit(1);
}

try {
  await Bun.build({ entrypoints, target: "bun", packages: "external" });
} catch (error) {
  console.error(`check:evals: bundling ${entrypoints.length} evals modules failed`);
  console.error(error);
  process.exit(1);
}

console.log(`check:evals: ${entrypoints.length} evals modules bundle cleanly`);
