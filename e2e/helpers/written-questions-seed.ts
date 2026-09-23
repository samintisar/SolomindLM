import type { Page } from "@playwright/test";
import { spawnSync } from "child_process";
import { TEST_EMAIL } from "../fixtures/auth.fixture";

type SeededWrittenQuestionSet = {
  writtenQuestionsId: string;
  title: string;
  questionCount: number;
};

function notebookIdFromPage(page: Page): string {
  const match = page.url().match(/\/notebook\/([^/?#]+)/);
  if (!match) {
    throw new Error(`Expected notebook URL, got ${page.url()}`);
  }
  return decodeURIComponent(match[1]);
}

export function seedWrittenQuestionSetForNotebook(
  page: Page,
  title: string
): SeededWrittenQuestionSet {
  const result = spawnSync(
    "bunx",
    [
      "convex",
      "run",
      "e2e/seedWrittenQuestions:createWrittenQuestionSet",
      JSON.stringify({ email: TEST_EMAIL, notebookId: notebookIdFromPage(page), title }),
    ],
    { cwd: process.cwd(), encoding: "utf-8", shell: false }
  );

  if (result.status !== 0) {
    throw new Error(
      `Failed to seed written questions:\n${result.stderr || result.stdout || "No output"}`
    );
  }

  return JSON.parse(result.stdout.trim()) as SeededWrittenQuestionSet;
}
