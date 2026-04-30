import type { Page } from "@playwright/test";
import { spawnSync } from "child_process";
import { TEST_EMAIL } from "../fixtures/auth.fixture";

type SeededFlashcardDeck = {
  flashcardId: string;
  title: string;
  cardCount: number;
};

function notebookIdFromPage(page: Page): string {
  const match = page.url().match(/\/notebook\/([^/?#]+)/);
  if (!match) {
    throw new Error(`Expected notebook URL, got ${page.url()}`);
  }
  return decodeURIComponent(match[1]);
}

export function seedFlashcardDeckForNotebook(page: Page, title: string): SeededFlashcardDeck {
  const result = spawnSync(
    "bunx",
    [
      "convex",
      "run",
      "e2e/seedFlashcards:createFlashcardDeck",
      JSON.stringify({
        email: TEST_EMAIL,
        notebookId: notebookIdFromPage(page),
        title,
      }),
    ],
    { cwd: process.cwd(), encoding: "utf-8", shell: false }
  );

  if (result.status !== 0) {
    throw new Error(
      `Failed to seed flashcard deck:\n${result.stderr || result.stdout || "No output"}`
    );
  }

  return JSON.parse(result.stdout.trim()) as SeededFlashcardDeck;
}
