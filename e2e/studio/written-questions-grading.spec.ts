import { expect, test } from "../fixtures/notebook.fixture";
import { shouldSkipAITests } from "../helpers/ai-service";
import { openStudioPanel } from "../helpers/navigation";
import { seedWrittenQuestionSetForNotebook } from "../helpers/written-questions-seed";

test.use({ viewport: { width: 1440, height: 900 } });
test.describe.configure({ timeout: 120_000 });

test.describe("Written Questions Grading", () => {
  async function openSeededSet(page: import("@playwright/test").Page) {
    const title = `E2E Written Questions ${Date.now()}`;
    const set = seedWrittenQuestionSetForNotebook(page, title);
    await openStudioPanel(page);
    await expect(page.getByText(set.title, { exact: true })).toBeVisible({ timeout: 20_000 });
    await page.getByText(set.title, { exact: true }).click();
    await expect(page.getByText("Question 1")).toBeVisible({ timeout: 15_000 });
    return set;
  }

  test("persists a typed answer across reload without submitting it", async ({ notebookPage }) => {
    const page = notebookPage;
    await openSeededSet(page);

    const answer =
      "Reduced evapotranspiration when vegetation is replaced by asphalt and concrete.";
    await page.getByPlaceholder(/Type your short answer/i).fill(answer);

    // Wait out the 800ms debounced autosave + the mutation round-trip.
    await page.waitForTimeout(2500);

    await page.reload();
    await openStudioPanel(page);
    await page
      .getByText(/^E2E Written Questions /)
      .first()
      .click();
    await expect(page.getByText("Question 1")).toBeVisible({ timeout: 15_000 });

    await expect(page.getByPlaceholder(/Type your short answer/i)).toHaveValue(answer);
  });

  test("grades unsubmitted answers on Finish and shows a non-zero score", async ({
    notebookPage,
  }) => {
    test.skip(shouldSkipAITests(), "Requires AI LLM for written-answer grading (E2E_AI_ENABLED=1)");
    test.setTimeout(300_000);
    const page = notebookPage;
    await openSeededSet(page);

    await page
      .getByPlaceholder(/Type your short answer/i)
      .fill(
        "Low-albedo materials like asphalt absorb solar radiation and re-radiate heat at night."
      );
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText("Question 2")).toBeVisible();
    await page
      .getByPlaceholder(/Type your short answer/i)
      .fill(
        "Green infrastructure — street trees and green roofs — plus cool roofs that raise albedo."
      );

    await page.getByRole("button", { name: "Finish" }).click();

    await expect(page.getByText("Assessment Complete!")).toBeVisible({ timeout: 240_000 });
    await expect(page.getByText("Graded 2 of 2 questions")).toBeVisible();

    const scoreText = await page.getByText(/You scored \d+ out of 10 points/).textContent();
    const scored = Number(scoreText?.match(/You scored (\d+)/)?.[1] ?? "0");
    expect(scored).toBeGreaterThan(0);
  });
});
