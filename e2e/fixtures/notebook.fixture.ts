import type { Page } from "@playwright/test";
import { randomUUID } from "crypto";
import { CHAT_TEXTAREA_PLACEHOLDER } from "../helpers/chat-assertions";
import { tryDeleteNotebookByTitleFromHome } from "../helpers/notebook-cleanup";
import { test as authTest, expect } from "./auth.fixture";

type NotebookFixtures = {
  notebookPage: Page;
};

/**
 * Extended fixture that creates a notebook and navigates into it.
 * Yields a page already on /notebook/:id with chat input visible.
 * Uses UUID for unique titles to avoid collisions in parallel workers.
 * Each test using this fixture creates one new `e2e-…` notebook; bulk-delete stragglers with
 * `bun run e2e:convex:cleanup` (Convex CLI) if needed.
 */
export const test = authTest.extend<NotebookFixtures>({
  notebookPage: async ({ authenticatedPage }, use) => {
    const page = authenticatedPage;

    // Use UUID to avoid title collisions across parallel workers
    const title = `e2e-${randomUUID().slice(0, 8)}`;

    // Open create notebook modal
    await page.getByText("Create new notebook").first().click();

    // Wait for modal to open and input to be visible
    const titleInput = page.getByPlaceholder("Notebook title");
    await expect(titleInput).toBeVisible({ timeout: 5_000 });

    // Click input to ensure focus, then fill
    await titleInput.click();
    await titleInput.fill(title);

    // Verify the value was set before submitting
    await expect(titleInput).toHaveValue(title);

    // Submit
    const createBtn = page.getByRole("button", { name: "Create" });
    await createBtn.waitFor({ state: "visible" });
    await expect(createBtn).toBeEnabled();
    await createBtn.click({ force: true });

    // Modal should close on success; then the new card appears on the grid/list
    await expect(page.getByRole("heading", { name: "Create notebook" })).not.toBeVisible({
      timeout: 15_000,
    });

    const notebookEl = page.getByText(title, { exact: true });
    await expect(notebookEl).toBeVisible({ timeout: 45_000 });

    // Click to navigate into the notebook
    await notebookEl.click();
    await expect(page).toHaveURL(/\/notebook\/.+/, { timeout: 15_000 });

    // Chat placeholder depends on deep-research toggle (see ChatInput.tsx)
    await expect(page.getByPlaceholder(CHAT_TEXTAREA_PLACEHOLDER)).toBeVisible({ timeout: 45_000 });

    await use(page);

    // Teardown: remove notebook created for this test (best-effort)
    await tryDeleteNotebookByTitleFromHome(page, title);
  },
});

export { expect };
