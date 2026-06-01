import { test as base, expect, type Page } from "@playwright/test";

export const TEST_EMAIL = process.env.E2E_TEST_EMAIL || "test-e2e@solomindlm.com";
export const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || "TestPass123!";

type AuthFixtures = {
  authenticatedPage: Page;
};

/**
 * Extended Playwright test with authenticated page fixture.
 * Auth state is loaded from .auth/storageState.json (created by global-setup.ts).
 * No per-test login needed.
 */
export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    // Storage state is already applied via playwright.config.ts use.storageState.
    // Navigate to home to confirm auth is working.
    await page.goto("/home");
    await use(page);
  },
});

export { expect };
