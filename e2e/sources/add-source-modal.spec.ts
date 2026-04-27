import { test, expect } from "../fixtures/notebook.fixture";
import { openAddSourceModal } from "../helpers/navigation";

test.describe("Add Source Modal", () => {
  test("opens with all source type options", async ({ notebookPage }) => {
    const page = notebookPage;

    // Open the add source modal (handles panel width variations)
    await openAddSourceModal(page);

    // Modal header
    await expect(page.getByText("Add sources")).toBeVisible();

    // Upload area
    await expect(page.getByText("Upload sources")).toBeVisible();

    // Source type buttons
    await expect(page.getByRole("button", { name: "Website" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Transcripts" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copied text" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Choose from Google Drive/ })).toBeVisible();

    // Discover sources button (in header)
    await expect(page.getByRole("button", { name: /Discover sources/ })).toBeVisible();
  });

  test("source limit bar shows count", async ({ notebookPage }) => {
    const page = notebookPage;

    await openAddSourceModal(page);

    // Footer should show 0 / 100 for a new notebook
    await expect(page.getByText("0 / 100")).toBeVisible();
    await expect(page.getByText("Source limit")).toBeVisible();
  });

  test("discover sources button opens discover modal", async ({ notebookPage }) => {
    const page = notebookPage;

    await openAddSourceModal(page);

    // Click Discover sources
    await page.getByRole("button", { name: /Discover sources/ }).click();

    // Should show discover modal with search input
    await expect(
      page.getByPlaceholder("Search for articles, papers, or websites...")
    ).toBeVisible({ timeout: 5_000 });
  });
});
