import { expect, test } from "../fixtures/notebook.fixture";
import { shouldSkipAITests } from "../helpers/ai-service";
import { firstStudioNoteCard, openStudioTool } from "../helpers/studio-assertions";
import { seedPastedTextSourceForStudio } from "../helpers/studio-seed";

test.use({ viewport: { width: 1440, height: 900 } });
test.describe.configure({ timeout: 120_000 });

test.describe("Quiz Generation", () => {
  async function createQuiz(page: import("@playwright/test").Page) {
    await seedPastedTextSourceForStudio(page);
    await openStudioTool(page, "Quiz");

    await expect(page.getByRole("heading", { name: /customize quiz/i })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: "Generate Quiz" }).click();

    const card = firstStudioNoteCard(page);
    await expect(card).toHaveAttribute("aria-busy", "true", { timeout: 15_000 });

    return { card };
  }

  test("with no sources shows needs-sources dialog", async ({ notebookPage }) => {
    const page = notebookPage;

    await openStudioTool(page, "Quiz");
    await expect(page.getByRole("heading", { name: /customize quiz/i })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Generate Quiz" }).click();

    await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/no sources selected/i)).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
  });

  test("creation creates placeholder with generating status", async ({ notebookPage }) => {
    test.skip(shouldSkipAITests(), "Requires source ingestion + quiz job (E2E_AI_ENABLED=1)");

    const page = notebookPage;
    const { card: noteEl } = await createQuiz(page);

    // Note should be busy and not clickable
    await expect(noteEl).toHaveAttribute("aria-busy", "true", { timeout: 15_000 });
    await expect(noteEl).toHaveClass(/cursor-not-allowed/);

    // Progress bar may or may not be visible depending on metadata
    const progressbar = noteEl.locator('[role="progressbar"]');
    if (await progressbar.isVisible().catch(() => false)) {
      await expect(progressbar).toHaveAttribute("aria-valuemin", "0");
      await expect(progressbar).toHaveAttribute("aria-valuemax", "100");
    }
  });

  test("transitions to completed status", async ({ notebookPage }) => {
    test.skip(shouldSkipAITests(), "Requires AI LLM for quiz generation");
    const completionBudgetMs = 600_000;
    test.setTimeout(completionBudgetMs + 30_000);

    const page = notebookPage;
    const { card: noteEl } = await createQuiz(page);

    await expect(noteEl).not.toHaveAttribute("aria-busy", "true", { timeout: completionBudgetMs });
    await expect(noteEl.locator("h4")).toBeVisible();
    await expect(noteEl).not.toHaveClass(/cursor-not-allowed/);
  });
});
