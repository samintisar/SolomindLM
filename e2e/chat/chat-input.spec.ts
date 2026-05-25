import { test, expect } from "../fixtures/notebook.fixture";
import {
  closeSourceFiltersMenu,
  openSourceFiltersMenu,
  openComposerModeMenu,
} from "../helpers/chat-assertions";

test.describe("Chat Input", () => {
  test("source filter can switch to Web", async ({ notebookPage }) => {
    const page = notebookPage;

    await openSourceFiltersMenu(page);

    const webLabel = page.locator("label").filter({ hasText: /^Web$/ });
    await expect(webLabel).toBeVisible();

    await webLabel.click();

    const webCheckbox = webLabel.locator('input[type="checkbox"]');
    await expect(webCheckbox).toBeChecked();

    await closeSourceFiltersMenu(page);
  });

  test("deep research mode is available in composer mode menu", async ({ notebookPage }) => {
    const page = notebookPage;

    await openComposerModeMenu(page);

    await page.getByRole("option", { name: "Deep Research", exact: true }).click();

    await expect(page.getByRole("button", { name: /Composer mode: Deep Research/ })).toBeVisible();

    await expect(page.getByPlaceholder(/Ask a complex research question/)).toBeVisible();
  });

  test("chat input shows correct placeholder", async ({ notebookPage }) => {
    const page = notebookPage;

    // Default placeholder when deep research is off
    await expect(page.getByPlaceholder(/Ask a question about your sources/)).toBeVisible();
  });
});
