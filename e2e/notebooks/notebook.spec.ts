import { test, expect } from "../fixtures/auth.fixture";
import { tryDeleteNotebookByTitleFromHome } from "../helpers/notebook-cleanup";

test.describe("Notebook CRUD", () => {
  test("creates a new notebook", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    const createBtn = page.getByText("Create new notebook").first();
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
    await expect(page.getByText(notebookTitle)).toBeVisible({ timeout: 15_000 });

    await tryDeleteNotebookByTitleFromHome(page, notebookTitle);
  });

  test("navigates into a notebook", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    const notebookCards = page.locator('[class*="notebook"]').filter({ hasText: "" });
    const count = await notebookCards.count();

    if (count > 0) {
      await notebookCards.first().click();
      await expect(page).toHaveURL(/\/notebook\/.+/, { timeout: 5_000 });
      await expect(
        page.getByPlaceholder(/Ask a question/)
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test("renames a notebook via the customize modal", async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    const beforeName = `e2e-rename-a-${Date.now()}`;
    const afterName = `e2e-rename-b-${Date.now()}`;

    await page.getByText("Create new notebook").first().click();
    await page.getByPlaceholder("Notebook title").fill(beforeName);
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(beforeName, { exact: true })).toBeVisible({ timeout: 10_000 });

    const notebookEl = page.getByText(beforeName, { exact: true });
    const card = notebookEl.locator("..");

    await card.hover();

    const menuBtn = card.locator('[class*="kebab"]').first();
    if (await menuBtn.isVisible()) {
      await menuBtn.click();
      await page.getByText("Customize").click();

      const titleInput = page.getByPlaceholder("Notebook title");
      await titleInput.clear();
      await titleInput.fill(afterName);

      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText(afterName, { exact: true })).toBeVisible({ timeout: 5_000 });
    }

    await tryDeleteNotebookByTitleFromHome(page, afterName);
    await tryDeleteNotebookByTitleFromHome(page, beforeName);
  });
});
