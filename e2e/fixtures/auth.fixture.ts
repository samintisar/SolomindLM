import { type BrowserContext, test as base, expect, type Page } from "@playwright/test";
import { signInWithPassword } from "../helpers/sign-in";

export const TEST_EMAIL = process.env.E2E_TEST_EMAIL || "test-e2e@solomindlm.com";
export const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || "TestPass123!";

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

type AuthFixtures = {
  authenticatedPage: Page;
};

type WorkerAuthFixtures = {
  /** This worker's signed-in session; `state` always holds its latest refresh token. */
  workerAuth: { state: StorageState };
};

/**
 * Extended Playwright test with an authenticated page.
 *
 * Each worker signs in once and its tests reuse that session. Convex Auth rotates the refresh
 * token on every page load, and presenting a superseded one more than 10s later revokes the
 * whole session, so tests can't all start from one saved snapshot: each test starts from the
 * state the previous test in the worker left behind.
 */
export const test = base.extend<AuthFixtures, WorkerAuthFixtures>({
  workerAuth: [
    async ({ browser }, use, workerInfo) => {
      const context = await browser.newContext({ baseURL: workerInfo.project.use.baseURL });
      await signInWithPassword(await context.newPage(), TEST_EMAIL, TEST_PASSWORD);
      const auth = { state: await context.storageState() };
      await context.close();
      await use(auth);
    },
    { scope: "worker" },
  ],

  storageState: async ({ workerAuth }, use) => {
    await use(workerAuth.state);
  },

  context: async ({ context, workerAuth }, use) => {
    await use(context);
    // Keep the refresh token this test rotated to, for the worker's next test.
    try {
      workerAuth.state = await context.storageState();
    } catch {
      // The test already timed out; a failed test gets a fresh worker, which signs in again.
    }
  },

  authenticatedPage: async ({ page }, use) => {
    await page.goto("/home");
    await use(page);
  },
});

export { expect };
