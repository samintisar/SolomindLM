import { expect, test } from "../fixtures/notebook.fixture";
import { shouldSkipAITests } from "../helpers/ai-service";
import {
  addPasteTextSource,
  deleteSource,
  getSourceCard,
  getSourceCheckbox,
  PASTED_TEXT_TITLE,
  renameSource,
  selectSource,
  waitForSourceStatus,
} from "../helpers/source-assertions";

test.describe("Source List", () => {
  test("source can be selected and deselected", async ({ notebookPage }) => {
    test.skip(shouldSkipAITests(), "Requires AI for source creation");

    const page = notebookPage;
    const sourceText = `Selection Test ${Date.now()}: This is test content for selection.`;

    await addPasteTextSource(page, sourceText);
    await waitForSourceStatus(page, PASTED_TEXT_TITLE, "completed", 120_000);

    // Sources are selected by default — verify initial selected state
    const checkbox = getSourceCheckbox(page, PASTED_TEXT_TITLE);
    await expect(checkbox).toBeChecked();

    // Deselect by clicking the checkbox
    await selectSource(page, PASTED_TEXT_TITLE);
    await expect(checkbox).not.toBeChecked();

    // Re-select by clicking again
    await selectSource(page, PASTED_TEXT_TITLE);
    await expect(checkbox).toBeChecked();
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

    // Menu -> Rename -> inline "Rename source" textbox -> Enter. The row's title
    // becomes an input while renaming, so the helper finds it by role, not by card.
    await renameSource(page, PASTED_TEXT_TITLE, newName);

    // Verify new name is visible in source card
    await expect(getSourceCard(page, newName)).toBeVisible({ timeout: 5_000 });
  });
});
