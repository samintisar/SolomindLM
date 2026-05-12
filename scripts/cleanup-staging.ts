#!/usr/bin/env bun
/**
 * Clean up staging deployment data.
 * Useful for resetting staging before major changes.
 *
 * Usage:
 *   bun run scripts/cleanup-staging.ts
 */

import { execSync } from "child_process";

console.log("Cleaning up staging deployment...");

try {
  // Reset staging database
  execSync("npx convex dev --reset --deployment staging", { stdio: "inherit" });
  console.log("✓ Staging database reset");
} catch (e) {
  console.error("Failed to reset staging:", e);
  process.exit(1);
}
