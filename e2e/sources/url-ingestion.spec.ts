import { test, expect } from "../fixtures/notebook.fixture";
import { shouldSkipAITests } from "../helpers/ai-service";
import { addUrlSource, waitForSourceStatus } from "../helpers/source-assertions";
import { openAddSourceModal } from "../helpers/navigation";

test.describe("URL Ingestion", () => {
  test("URL modal validates input format", async ({ notebookPage }) => {
    const page = notebookPage;

    // Open add source modal and click Website
    await openAddSourceModal(page);
    await page.getByRole("button", { name: "Website" }).click();

    // Enter invalid URL
    await page.getByPlaceholder(/https:\/\/example\.com/).fill("not-a-url");

    // Submit
    await page.getByRole("button", { name: "Add Sources" }).click();

    // Should show validation error
    await expect(
      page.getByText(/Please enter at least one valid URL/)
    ).toBeVisible();
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
