import { defineConfig } from "@playwright/test";

/**
 * CSP smoke test config. Separate from playwright.config.ts on purpose: that suite needs a
 * logged-in test account, a running Convex backend and secrets (and is skipped in CI without
 * them), while this one only needs the built web app.
 *
 *   bun run build:prod        # or any build of apps/web
 *   bun run test:csp
 */
const port = Number(process.env.CSP_SERVER_PORT ?? 4173);

export default defineConfig({
  testDir: "./e2e/csp",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "line",
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: "bun e2e/csp/serve-dist.ts",
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
