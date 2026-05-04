import type { Page } from "@playwright/test";

/**
 * Delete a notebook from the home "My Notebooks" grid/list via the card kebab menu
 * and the confirmation dialog. Idempotent: no-op if the title is not visible.
 * Designed for e2e teardown; failures are swallowed by the caller.
 *
 * **Limitation:** notebooks moved into a folder are not listed on /home; use
 * `bunx convex run e2e/cleanupNotebooks:deleteE2eNotebooksByEmail` for bulk cleanup.
 */
export async function deleteNotebookByTitleFromHome(page: Page, title: string): Promise<void> {
  await page.goto("/home", { waitUntil: "load" });
  await page
    .getByRole("button", { name: "All" })
    .click()
    .catch(() => {});

  await page
    .getByRole("heading", { name: "My Notebooks" })
    .waitFor({ state: "visible", timeout: 20_000 });

  const titleEl = page.getByText(title, { exact: true }).first();
  const visible = await titleEl.isVisible({ timeout: 12_000 }).catch(() => false);
  if (!visible) {
    return;
  }

  await titleEl.scrollIntoViewIfNeeded();

  const card = page
    .locator("div.group")
    .filter({ has: page.getByText(title, { exact: true }) })
    .first();
  await card.locator(".kebab-menu button").first().click();

  // Dropdown item (not the alert dialog yet)
  await page
    .locator("div.bg-popover")
    .getByRole("button", { name: "Delete" })
    .click({ timeout: 5_000 });

  // Confirm dialog (title is "Delete Notebook" from the app)
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete" })
    .click({ timeout: 5_000 });
}

/**
 * Best-effort cleanup for notebook teardowns (do not fail the test on errors).
 */
export async function tryDeleteNotebookByTitleFromHome(page: Page, title: string): Promise<void> {
  try {
    await deleteNotebookByTitleFromHome(page, title);
  } catch {
    // Ignore — notebook may already be gone, or UI changed; avoid failing the e2e run.
  }
}
