import { expect, test } from "../fixtures/notebook.fixture";
import { seedFlashcardDeckForNotebook } from "../helpers/flashcard-seed";
import { openStudioPanel } from "../helpers/navigation";

test.use({ viewport: { width: 1440, height: 900 } });
test.describe.configure({ timeout: 90_000 });

test.describe("Flashcards Study Mode", () => {
  async function openSeededFlashcardDeck(page: import("@playwright/test").Page) {
    const title = `E2E Flashcards ${Date.now()}`;
    const deck = seedFlashcardDeckForNotebook(page, title);

    await openStudioPanel(page);
    await expect(page.getByText(deck.title, { exact: true })).toBeVisible({ timeout: 20_000 });
    await page.getByText(deck.title, { exact: true }).click();
    await expect(page.getByText("What is spaced repetition?")).toBeVisible({ timeout: 15_000 });

    return deck;
  }

  test("shows Anki-style learning intervals for a new card", async ({ notebookPage }) => {
    const page = notebookPage;
    await openSeededFlashcardDeck(page);

    await page.getByRole("button", { name: "Study Mode" }).click();
    await page.getByRole("button", { name: "Reveal answer" }).click();

    await expect(page.getByRole("button", { name: /Again\s+in 1 min/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Hard\s+in 6 min/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Good\s+in 10 min/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Easy\s+in 4 days/i })).toBeVisible();
  });

  test("persists a study review and keeps the session on the next card", async ({
    notebookPage,
  }) => {
    const page = notebookPage;
    await openSeededFlashcardDeck(page);

    await page.getByRole("button", { name: "Study Mode" }).click();
    await page.getByRole("button", { name: "Reveal answer" }).click();
    await page.getByRole("button", { name: /Good\s+in 10 min/i }).click();

    await expect(page.getByText("What should the Good button do on a new flashcard?")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("1 of 3 reviewed")).toBeVisible();

    await page.getByRole("button", { name: "Browse Mode" }).click();
    await expect(page.getByText("Progressing")).toBeVisible({ timeout: 15_000 });
  });
});
