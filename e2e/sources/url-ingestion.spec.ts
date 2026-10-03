import { expect, test } from "../fixtures/notebook.fixture";
import { shouldSkipAITests } from "../helpers/ai-service";
import { openAddSourceModal } from "../helpers/navigation";
import { addUrlSource, waitForSourceStatus } from "../helpers/source-assertions";

test.describe("URL Ingestion", () => {
  test("URL modal validates input format", async ({ notebookPage }) => {
    const page = notebookPage;

    // Open the add-source dialog and click Website
    await openAddSourceModal(page);
    await page
      .getByRole("dialog", { name: "Add sources" })
      .getByRole("button", { name: "Website", exact: true })
      .click();

    // The website step replaces the menu inside the same (only) dialog
    const dialog = page.getByRole("dialog");

    // Enter invalid URL
    await dialog.getByPlaceholder(/https:\/\/example\.com/).fill("not-a-url");

    // Submit
    await dialog.getByRole("button", { name: "Add Sources", exact: true }).click();

    // The validation error is a toast, which renders outside the dialog
    await expect(page.getByText(/Please enter at least one valid URL/)).toBeVisible();
  });

  test("URL source processes to completed", async ({ notebookPage }) => {
    test.skip(shouldSkipAITests(), "Requires AI services for URL scraping + embeddings");

    const page = notebookPage;

    await addUrlSource(page, "https://example.com");

    // Source should appear
    await expect(page.getByText("example.com")).toBeVisible({ timeout: 10_000 });

    // Wait for completion
    await waitForSourceStatus(page, "example.com", "completed", 240_000);
  });
});
