import { chromium, type FullConfig } from "@playwright/test";
import { spawnSync } from "child_process";
import { signInWithPassword } from "./helpers/sign-in";

/** Repo root: run E2E from the project root (`bunx playwright test`). */
const repoRoot = process.cwd();

/**
 * Global setup: check the test account signs in and save its storage state (used by specs that
 * import `test` from @playwright/test; `auth.fixture` tests sign in once per worker instead).
 */
async function globalSetup(config: FullConfig) {
  if (!process.env.E2E_TEST_EMAIL?.trim() || !process.env.E2E_TEST_PASSWORD) {
    throw new Error(
      "E2E_TEST_EMAIL and E2E_TEST_PASSWORD environment variables are required. " +
        "Set them before running tests: E2E_TEST_EMAIL=you@example.com E2E_TEST_PASSWORD=yourpass bunx playwright test"
    );
  }

  const TEST_EMAIL = process.env.E2E_TEST_EMAIL!;
  const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD!;

  const { baseURL } = config.projects[0].use;
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  await signInWithPassword(page, TEST_EMAIL, TEST_PASSWORD);

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
        console.log(
          `[e2e global-setup] Removed ${out.deleted} e2e-prefixed notebook(s) before tests.`
        );
      }
    } catch {
      // non-JSON output is fine
    }
  }
}

export default globalSetup;
