import { expect, test } from "../fixtures/auth.fixture";
import { myNotebooks, tryDeleteNotebookByTitleFromHome } from "../helpers/notebook-cleanup";

test.describe("Notebook CRUD", () => {
  test("creates a new notebook", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    const createBtn = page.getByRole("button", { name: "New notebook" }).first();
    await createBtn.click();

    await expect(page.getByRole("heading", { name: "Create notebook" })).toBeVisible();

    const notebookTitle = `e2e-test-${Date.now()}`;
    const titleInput = page.getByPlaceholder("Notebook title");
    await titleInput.click();
    await titleInput.fill(notebookTitle);

    // Submit
    await page.getByRole("button", { name: "Create" }).click();

    // Modal should close
    await expect(page.getByRole("heading", { name: "Create notebook" })).not.toBeVisible();

    // New notebook should appear in the grid (Convex sync may take a moment)
    await expect(myNotebooks(page).getByText(notebookTitle, { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await tryDeleteNotebookByTitleFromHome(page, notebookTitle);
  });

  test("navigates into a notebook", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    const notebookCards = page.locator('[data-slot="card"]');
    const count = await notebookCards.count();

    if (count > 0) {
      await notebookCards.first().click();
      await expect(page).toHaveURL(/\/notebook\/.+/, { timeout: 5_000 });
      await expect(page.getByPlaceholder(/Ask a question/)).toBeVisible({ timeout: 5_000 });
    }
  });

  test("renames a notebook via the customize modal", async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    const beforeName = `e2e-rename-a-${Date.now()}`;
    const afterName = `e2e-rename-b-${Date.now()}`;

    await page.getByRole("button", { name: "New notebook" }).first().click();
    await page.getByPlaceholder("Notebook title").fill(beforeName);
    await page.getByRole("button", { name: "Create" }).click();
    await expect(myNotebooks(page).getByText(beforeName, { exact: true })).toBeVisible({
      timeout: 10_000,
    });

    const card = page.locator('[data-slot="card"]', { hasText: beforeName });
    await card.getByRole("button", { name: "Notebook actions" }).click();
    await page.getByRole("menuitem", { name: "Customize" }).click();

    const titleInput = page.getByPlaceholder("Notebook title");
    await titleInput.clear();
    await titleInput.fill(afterName);

    await page.getByRole("button", { name: "Save" }).click();
    await expect(myNotebooks(page).getByText(afterName, { exact: true })).toBeVisible({
      timeout: 5_000,
    });

    await tryDeleteNotebookByTitleFromHome(page, afterName);
    await tryDeleteNotebookByTitleFromHome(page, beforeName);
  });
});
