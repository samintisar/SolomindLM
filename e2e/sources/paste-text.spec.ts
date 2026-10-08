import { expect, test } from "../fixtures/notebook.fixture";
import { shouldSkipAITests } from "../helpers/ai-service";
import {
  addPasteTextSource,
  getSourceCard,
  waitForSourceStatus,
} from "../helpers/source-assertions";

test.describe("Paste Text Source", () => {
  test("paste text creates source in the list", async ({ notebookPage }) => {
    test.skip(shouldSkipAITests(), "Requires AI embeddings");

    const page = notebookPage;
    const sourceText = `E2E Paste Test ${Date.now()}: The quick brown fox jumps over the lazy dog. This is a longer text to ensure sufficient content for embedding generation and chunk creation.`;

    const title = await addPasteTextSource(page, sourceText);

    // Source should appear in the list under the title typed in the dialog
    const sourceCard = getSourceCard(page, title);
    await expect(sourceCard).toBeVisible({ timeout: 15_000 });
  });

  test("source transitions to completed status", async ({ notebookPage }) => {
    test.skip(shouldSkipAITests(), "Requires AI embeddings");

    const page = notebookPage;
    const sourceText = `E2E Complete Test ${Date.now()}: Another block of text for testing status transitions. Contains enough content to produce embeddings and chunks for vector search.`;

    const title = await addPasteTextSource(page, sourceText);

    // Wait for source to reach completed status
    await waitForSourceStatus(page, title, "completed", 120_000);
  });
});
