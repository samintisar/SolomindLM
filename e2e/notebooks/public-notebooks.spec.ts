import { expect, test } from "../fixtures/auth.fixture";
import { myNotebooks, tryDeleteNotebookByTitleFromHome } from "../helpers/notebook-cleanup";

// Single user: the cross-user viewer flow (read-only access, private chat, fork) is covered by
// the Convex tests for notebook access and `convex/notebooks/public.ts`.
test.describe("Public notebooks", () => {
  test("publishing a notebook lists it on the Public tab", async ({ authenticatedPage }) => {
    // Creating a notebook alone can take most of the default 30s on the dev deployment.
    test.setTimeout(90_000);
    const page = authenticatedPage;
    const title = `e2e-public-${Date.now()}`;

    await page.getByRole("button", { name: "New notebook" }).first().click();
    const titleInput = page.getByPlaceholder("Notebook title");
    await titleInput.click();
    await titleInput.fill(title);
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("heading", { name: "Create notebook" })).not.toBeVisible({
      timeout: 15_000,
    });

    try {
      await myNotebooks(page).getByText(title, { exact: true }).click({ timeout: 45_000 });
      await expect(page).toHaveURL(/\/notebook\/.+/, { timeout: 15_000 });
      const notebookUrl = page.url();

      const makePublic = page.getByRole("switch", { name: "Make public" });

      await page.getByRole("button", { name: "Share notebook" }).click();
      await expect(makePublic).not.toBeChecked();
      await makePublic.click();
      await expect(page.getByText("Notebook is now public")).toBeVisible();
      await expect(makePublic).toBeChecked();
      await page.keyboard.press("Escape");

      await page.goto("/home");
      await page.getByRole("tab", { name: "Public" }).click();
      await expect(
        page.getByRole("tabpanel", { name: "Public" }).getByText(title, { exact: true })
      ).toBeVisible({ timeout: 15_000 });

      // Leave the shared e2e account clean: unpublish before the notebook is deleted.
      await page.goto(notebookUrl);
      await page.getByRole("button", { name: "Share notebook" }).click();
      await expect(makePublic).toBeChecked();
      await makePublic.click();
      await expect(page.getByText("Notebook is private again")).toBeVisible();
      await page.keyboard.press("Escape");
    } finally {
      await tryDeleteNotebookByTitleFromHome(page, title);
    }
  });
});
