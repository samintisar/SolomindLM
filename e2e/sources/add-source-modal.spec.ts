import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/notebook.fixture";
import { openAddSourceModal } from "../helpers/navigation";

/**
 * The modal has no dialog role and the sources panel stays mounted behind it, so a bare
 * "Discover sources" locator also matches the panel's tray button. Scope to the heading's row.
 */
function modalDiscoverButton(page: Page) {
  return page
    .getByRole("heading", { name: "Add sources" })
    .locator("..")
    .getByRole("button", { name: /Discover sources/ });
}

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
    const googleDriveButton = page.getByRole("button", { name: /Choose from Google Drive/ });
    if (await googleDriveButton.isVisible()) {
      await expect(googleDriveButton).toBeVisible();
    }

    // Discover sources button (in header)
    await expect(modalDiscoverButton(page)).toBeVisible();
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
    await modalDiscoverButton(page).click();

    // Should show discover modal with search input
    await expect(page.getByPlaceholder("Search for articles, papers, or websites...")).toBeVisible({
      timeout: 5_000,
    });
  });
});
