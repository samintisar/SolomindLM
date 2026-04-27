import { test, expect } from "../fixtures/notebook.fixture";
import { shouldSkipAITests } from "../helpers/ai-service";
import {
  addPasteTextSource,
  selectSource,
  deleteSource,
  waitForSourceStatus,
  getSourceCard,
  openSourceKebab,
  PASTED_TEXT_TITLE,
} from "../helpers/source-assertions";

test.describe("Source List", () => {
  test("source can be selected and deselected", async ({ notebookPage }) => {
    test.skip(shouldSkipAITests(), "Requires AI for source creation");

    const page = notebookPage;
    const sourceText = `Selection Test ${Date.now()}: This is test content for selection.`;

    await addPasteTextSource(page, sourceText);
    await waitForSourceStatus(page, PASTED_TEXT_TITLE, "completed", 120_000);

    // Sources are selected by default — verify initial selected state
    const card = getSourceCard(page, PASTED_TEXT_TITLE);
    await expect(card.locator("svg[class*='check']")).toBeVisible();

    // Deselect by clicking the checkbox
    await selectSource(page, PASTED_TEXT_TITLE);

    // Checked icon should be gone
    await expect(card.locator("svg[class*='check']")).not.toBeVisible();

    // Re-select by clicking again
    await selectSource(page, PASTED_TEXT_TITLE);

    // Checked icon should be back
    await expect(card.locator("svg[class*='check']")).toBeVisible();
  });

  test("source can be deleted", async ({ notebookPage }) => {
    test.skip(shouldSkipAITests(), "Requires AI for source creation");

    const page = notebookPage;
    const sourceText = `Delete Test ${Date.now()}: This content will be deleted.`;

    await addPasteTextSource(page, sourceText);
    await waitForSourceStatus(page, PASTED_TEXT_TITLE, "completed", 120_000);

    // Verify source card is visible (use getSourceCard to avoid matching hidden mobile layout)
    const card = getSourceCard(page, PASTED_TEXT_TITLE);
    await expect(card).toBeVisible();

    // Delete it
    await deleteSource(page, PASTED_TEXT_TITLE);

    // Source should be removed
    await expect(getSourceCard(page, PASTED_TEXT_TITLE)).not.toBeVisible({ timeout: 5_000 });
  });

  test("source can be renamed via kebab menu", async ({ notebookPage }) => {
    test.skip(shouldSkipAITests(), "Requires AI for source creation");

    const page = notebookPage;
    const sourceText = `Rename Test ${Date.now()}: Original name.`;
    const newName = `Renamed Source ${Date.now()}`;

    await addPasteTextSource(page, sourceText);
    await waitForSourceStatus(page, PASTED_TEXT_TITLE, "completed", 120_000);

    // Open kebab menu via evaluate (bypasses ChatEmptyState overlay)
    await openSourceKebab(page, PASTED_TEXT_TITLE);

    // Click Rename (evaluate bypasses ChatEmptyState overlay)
    await page.getByText("Rename").first().evaluate((el) => (el as HTMLElement).click());

    // The rename input appears inline with border-primary class and autoFocus.
    // Can't use getSourceCard because the h4 text changes to an input.
    const renameInput = page.locator("input.border-primary").first();
    await expect(renameInput).toBeVisible({ timeout: 5_000 });
    await renameInput.clear();
    await renameInput.fill(newName);
    await renameInput.press("Enter");

    // Verify new name is visible in source card
    await expect(getSourceCard(page, newName)).toBeVisible({ timeout: 5_000 });
  });
});
