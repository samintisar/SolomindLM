import { expect, test } from "../fixtures/notebook.fixture";
import { shouldSkipAITests } from "../helpers/ai-service";
import {
  deleteNote,
  firstStudioNoteCard,
  openStudioTool,
  renameNote,
} from "../helpers/studio-assertions";
import { seedPastedTextSourceForStudio } from "../helpers/studio-seed";

test.use({ viewport: { width: 1440, height: 900 } });
test.describe.configure({ timeout: 90_000 });

test.describe("Studio Note Lifecycle", () => {
  /**
   * Ingests a paste source, then triggers report creation via Summary format (CreateReportModal).
   * Returns the generating note element.
   */
  async function createGeneratingNote(page: import("@playwright/test").Page) {
    await seedPastedTextSourceForStudio(page);
    await openStudioTool(page, "Reports");

    await expect(page.getByRole("heading", { name: /create report/i })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("heading", { level: 4, name: "Summary" }).click();

    const card = firstStudioNoteCard(page);
    await expect(card).toHaveAttribute("aria-busy", "true", { timeout: 15_000 });
    const title = ((await card.locator("h4").textContent()) || "Summary").trim();

    return { card, title };
  }

  test("generating note shows progress bar with aria attributes", async ({ notebookPage }) => {
    test.skip(shouldSkipAITests(), "Requires AI for generation");

    const page = notebookPage;
    const { card: noteEl } = await createGeneratingNote(page);

    // Progress bar with correct ARIA
    const progressbar = noteEl.locator('[role="progressbar"]');
    await expect(progressbar).toBeVisible({ timeout: 15_000 });
    await expect(progressbar).toHaveAttribute("aria-valuemin", "0");
    await expect(progressbar).toHaveAttribute("aria-valuemax", "100");
  });

  test("generating note is not clickable", async ({ notebookPage }) => {
    test.skip(shouldSkipAITests(), "Requires AI for generation");

    const page = notebookPage;
    const { card: noteEl } = await createGeneratingNote(page);

    // Should have cursor-not-allowed class
    await expect(noteEl).toHaveClass(/cursor-not-allowed/);
  });

  test("note can be renamed via kebab menu", async ({ notebookPage }) => {
    test.skip(shouldSkipAITests(), "Requires AI for generation + completion");
    const completionBudgetMs = 240_000;
    test.setTimeout(completionBudgetMs + 30_000);

    const page = notebookPage;
    const { card: noteEl } = await createGeneratingNote(page);

    // If this times out, inspect Convex report job + model API — not just test duration
    await expect(noteEl).not.toHaveAttribute("aria-busy", "true", { timeout: completionBudgetMs });

    const originalTitle = ((await noteEl.locator("h4").textContent()) || "Report").trim();
    const newTitle = `Renamed ${Date.now()}`;
    await renameNote(page, originalTitle, newTitle);

    // Verify new title is visible
    await expect(page.getByText(newTitle, { exact: true })).toBeVisible({ timeout: 5_000 });
  });

  test("note can be deleted via kebab menu", async ({ notebookPage }) => {
    test.skip(shouldSkipAITests(), "Requires AI for generation");
    test.setTimeout(90_000);

    const page = notebookPage;
    const { title } = await createGeneratingNote(page);

    // Delete it (may still be generating)
    await deleteNote(page, title);

    // Note should be removed from the list
    await expect(page.getByText(title, { exact: true })).not.toBeVisible({ timeout: 15_000 });
  });
});
