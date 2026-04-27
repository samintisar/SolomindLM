import { test, expect } from "../fixtures/notebook.fixture";
import { closeResearchOptionsMenu, openResearchOptionsMenu } from "../helpers/chat-assertions";

test.describe("Chat Input", () => {
  test("source filter can switch to Web", async ({ notebookPage }) => {
    const page = notebookPage;

    // Open the Research Options menu
    await openResearchOptionsMenu(page);

    // Source filter checkboxes should be visible inside the dropdown
    const webLabel = page.locator("label").filter({ hasText: /^Web$/ });
    await expect(webLabel).toBeVisible();

    // Enable Web filter
    await webLabel.click();

    // Verify Web checkbox is now checked
    const webCheckbox = webLabel.locator('input[type="checkbox"]');
    await expect(webCheckbox).toBeChecked();

    await closeResearchOptionsMenu(page);
  });

  test("deep research toggle is visible in options menu", async ({ notebookPage }) => {
    const page = notebookPage;

    // Open the Research Options menu
    await openResearchOptionsMenu(page);

    // "Deep Research" toggle should be visible in the dropdown
    const deepResearchBtn = page.getByRole("button", { name: /Deep Research/i });
    await expect(deepResearchBtn).toBeVisible();

    // Click to enable
    await deepResearchBtn.click();

    // The toggle pill should now appear next to the "+" button showing "Deep research"
    await expect(page.getByText("Deep research")).toBeVisible();

    // Placeholder should change to research-specific text
    await expect(
      page.getByPlaceholder(/Ask a complex research question/)
    ).toBeVisible();
  });

  test("chat input shows correct placeholder", async ({ notebookPage }) => {
    const page = notebookPage;

    // Default placeholder when deep research is off
    await expect(
      page.getByPlaceholder(/Ask a question about your sources/)
    ).toBeVisible();
  });
});
