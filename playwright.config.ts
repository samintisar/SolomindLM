import { defineConfig } from "@playwright/test";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

// Load .env.e2e if present (gitignored — holds E2E_TEST_EMAIL, E2E_TEST_PASSWORD)
const envPath = resolve(__dirname, ".env.e2e");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

/**
 * Playwright E2E test configuration.
 *
 * These tests require:
 *   1. A running web dev server (bun run dev:web)
 *   2. A running Convex dev backend (bun x convex dev)
 *   3. E2E_TEST_EMAIL / E2E_TEST_PASSWORD (GitHub Actions: repository secrets)
 *
 * Run locally:
 *   bunx playwright test
 *
 * Run with UI:
 *   bunx playwright test --ui
 */
const hasE2ECreds = Boolean(
  process.env.E2E_TEST_EMAIL?.trim() && process.env.E2E_TEST_PASSWORD?.trim()
);
/** In CI, skip E2E when repo secrets are missing (0 tests, exit 0). Add E2E_TEST_* secrets to run for real. */
const skipE2EInCI = process.env.CI === "true" && !hasE2ECreds;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 1,
  reporter: process.env.CI ? "html" : "line",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  // CI without secrets: ignore all spec files
  testIgnore: skipE2EInCI ? "**/*.ts" : undefined,

  globalSetup: skipE2EInCI ? undefined : "./e2e/global-setup.ts",

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    ...(!skipE2EInCI ? { storageState: ".auth/storageState.json" as const } : {}),
  },

  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],

  // No webServer config — start servers manually before running tests.
  // This avoids coupling test runner to Convex dev backend lifecycle.
});
