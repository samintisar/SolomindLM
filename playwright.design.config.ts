import { defineConfig } from "@playwright/test";

/**
 * Screenshot tests for the /dev/design gallery (e2e/design).
 *
 * Baselines are Linux renders: run through Docker with `bun run test:design`
 * (`bun run test:design:update` to accept a change), never directly on Windows/macOS.
 * CI runs this config inside the same Playwright image (ci.yml `design-snapshots`).
 *
 * The web server is a production build with the gallery bundled in (VITE_DESIGN_GALLERY=1),
 * served by `vite preview` on :4174 so it never collides with the :5173 dev server.
 */
export default defineConfig({
  testDir: "./e2e/design",
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: "disabled" },
  },

  use: {
    baseURL: "http://localhost:4174",
    trace: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],

  webServer: {
    command: "bunx vite build && bunx vite preview --port 4174 --strictPort",
    cwd: "apps/web",
    env: { VITE_DESIGN_GALLERY: "1" },
    port: 4174,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
  },
});
