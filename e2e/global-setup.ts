import { chromium, type FullConfig } from "@playwright/test";
import { spawnSync } from "child_process";

/** Repo root: run E2E from the project root (`bunx playwright test`). */
const repoRoot = process.cwd();

if (!process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD) {
  throw new Error(
    "E2E_TEST_EMAIL and E2E_TEST_PASSWORD environment variables are required. " +
      "Set them before running tests: E2E_TEST_EMAIL=you@example.com E2E_TEST_PASSWORD=yourpass bunx playwright test"
  );
}

const TEST_EMAIL = process.env.E2E_TEST_EMAIL!;
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD!;

/**
 * Global setup: authenticate once and save storage state.
 * All workers reuse this auth state instead of logging in per test.
 */
async function globalSetup(config: FullConfig) {
  const { baseURL } = config.projects[0].use;
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  await page.goto("/sign-in");
  await page.getByPlaceholder("Enter your email").fill(TEST_EMAIL);
  await page.getByPlaceholder("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Continue with email" }).click();

  try {
    await page.waitForURL("/home", { timeout: 10_000 });
  } catch {
    throw new Error(
      "E2E global setup: sign-in landed on verification screen. Ensure test account is already verified."
    );
  }

  await context.storageState({ path: ".auth/storageState.json" });
  await browser.close();

  // Free headroom under the notebook cap (Pro: 100) so fixtures can create `e2e-…` notebooks.
  // Without this, repeated E2E runs can leave the modal open on "Create" (limit error).
  const cleanup = spawnSync(
    "bunx",
    [
      "convex",
      "run",
      "e2e/cleanupNotebooks:deleteE2eNotebooksByEmail",
      JSON.stringify({ email: TEST_EMAIL.trim() }),
    ],
    { cwd: repoRoot, encoding: "utf-8", shell: false }
  );
  if (cleanup.status !== 0) {
    console.warn(
      "[e2e global-setup] cleanupNotebooks failed (is `bun x convex dev` running for this deployment?):\n",
      cleanup.stderr || cleanup.stdout
    );
  } else {
    try {
      const out = JSON.parse(cleanup.stdout.trim() || "{}") as { deleted?: number; error?: string };
      if (out.deleted && out.deleted > 0) {
        console.log(`[e2e global-setup] Removed ${out.deleted} e2e-prefixed notebook(s) before tests.`);
      }
    } catch {
      // non-JSON output is fine
    }
  }
}

export default globalSetup;
