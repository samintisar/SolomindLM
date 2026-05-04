import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Load .env and .env.local for tests
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * Run `bun run test:convex` from repo root.
 * Convex tests + Vitest deps live at the repo root so `convex/` has no nested `node_modules/convex`.
 */
export default defineConfig({
  root,
  test: {
    globals: true,
    environment: "node",
    include: ["tests/convex/**/*.ts", "convex/**/*.test.ts"],
  },
});
