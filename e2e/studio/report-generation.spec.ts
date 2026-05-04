import { test, expect } from "../fixtures/notebook.fixture";
import { shouldSkipAITests } from "../helpers/ai-service";
import { firstStudioNoteCard, openStudioTool } from "../helpers/studio-assertions";
import { seedPastedTextSourceForStudio } from "../helpers/studio-seed";

test.use({ viewport: { width: 1440, height: 900 } });
test.describe.configure({ timeout: 90_000 });

test.describe("Report Generation", () => {
  /**
   * Ingests a paste source, then triggers report creation via Summary format (CreateReportModal).
   * Returns the generating note element for further assertions.
   */
  async function createReport(page: import("@playwright/test").Page) {
    await seedPastedTextSourceForStudio(page);
    await openStudioTool(page, "Reports");

    await expect(page.getByRole("heading", { name: /create report/i })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("heading", { level: 4, name: "Summary" }).click();

    // Do not key off the list h4 title: Convex replaces the placeholder title with an LLM title when done,
    // which would detach title-based locators and stall until timeout.
    const card = firstStudioNoteCard(page);
    await expect(card).toHaveAttribute("aria-busy", "true", { timeout: 15_000 });

    return { card };
  }

  test("Summary format with no sources shows needs-sources dialog", async ({ notebookPage }) => {
    const page = notebookPage;

    await openStudioTool(page, "Reports");
    await expect(page.getByRole("heading", { name: /create report/i })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("heading", { level: 4, name: "Summary" }).click();

    await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/no sources selected/i)).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
  });

  test("report creation creates placeholder with generating status", async ({ notebookPage }) => {
    test.skip(shouldSkipAITests(), "Requires source ingestion + report job (E2E_AI_ENABLED=1)");

    const page = notebookPage;

    const { card: noteEl } = await createReport(page);

    // Should have progress bar with correct ARIA attributes
    const progressbar = noteEl.locator('[role="progressbar"]');
    await expect(progressbar).toBeVisible({ timeout: 15_000 });
    await expect(progressbar).toHaveAttribute("aria-valuemin", "0");
    await expect(progressbar).toHaveAttribute("aria-valuemax", "100");
  });

  test("report transitions to completed status", async ({ notebookPage }) => {
    test.skip(shouldSkipAITests(), "Requires AI LLM for report generation");
    // If this fails near the cap, check report actions / LLM env — don’t only raise the timeout
    const completionBudgetMs = 240_000;
    test.setTimeout(completionBudgetMs + 30_000);

    const page = notebookPage;

    const { card: noteEl } = await createReport(page);

    await expect(noteEl).not.toHaveAttribute("aria-busy", "true", { timeout: completionBudgetMs });

    // Completed note should have a title (h4) and be clickable (no cursor-not-allowed)
    await expect(noteEl.locator("h4")).toBeVisible();
    await expect(noteEl).not.toHaveClass(/cursor-not-allowed/);
  });
});
