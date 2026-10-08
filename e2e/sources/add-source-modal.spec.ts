import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/notebook.fixture";
import { openAddSourceModal } from "../helpers/navigation";

/** The add-source dialog; Radix hides the panel behind it from role queries. */
function addSourcesDialog(page: Page) {
  return page.getByRole("dialog", { name: "Add sources" });
}

function modalDiscoverButton(page: Page) {
  return addSourcesDialog(page).getByRole("button", { name: "Discover sources" });
}

test.describe("Add Source Modal", () => {
  test("opens with all source type options", async ({ notebookPage }) => {
    const page = notebookPage;

    // Open the add-source dialog (handles panel width variations)
    await openAddSourceModal(page);
    const dialog = addSourcesDialog(page);

    // Dialog title
    await expect(dialog).toBeVisible();

    // Upload area
    await expect(dialog.getByText("Upload sources")).toBeVisible();

    // Source type buttons
    await expect(dialog.getByRole("button", { name: "Website", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Transcripts", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Copied text", exact: true })).toBeVisible();
    const googleDriveButton = dialog.getByRole("button", { name: /Choose from Google Drive/ });
    if (await googleDriveButton.isVisible()) {
      await expect(googleDriveButton).toBeVisible();
    }

    // Discover sources button (in header)
    await expect(modalDiscoverButton(page)).toBeVisible();
  });

  test("source limit bar shows count", async ({ notebookPage }) => {
    const page = notebookPage;

    await openAddSourceModal(page);

    // Footer shows 0 of the plan's per-notebook cap (20 Free, 200 Pro) for a new notebook
    const dialog = addSourcesDialog(page);
    await expect(dialog.getByText(/^0 \/ \d+$/)).toBeVisible();
    await expect(dialog.getByText("Source limit")).toBeVisible();
  });

  test("discover sources button opens the discover dialog", async ({ notebookPage }) => {
    const page = notebookPage;

    await openAddSourceModal(page);

    // Click Discover sources
    await modalDiscoverButton(page).click();

    // Should show the discover dialog with its search input
    const discoverDialog = page.getByRole("dialog", { name: "Discover sources" });
    await expect(discoverDialog).toBeVisible({ timeout: 5_000 });
    await expect(
      discoverDialog.getByPlaceholder("Search for articles, papers, or websites...")
    ).toBeVisible();
  });
});
