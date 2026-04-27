import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { openStudioPanel } from "./navigation";

/** Tool card labels from shared/constants/index.ts */
export const TOOL_LABELS = [
  "Audio Overview",
  "Mind Map",
  "Reports",
  "Flashcards",
  "Quiz",
  "Slide Deck",
  "Written Questions",
  "Spreadsheets",
] as const;

const studioGrid = (page: Page) => page.getByTestId("studio-tool-grid");

/** Note list item root (contains title h4 + kebab); not the h4's immediate parent */
function studioNoteCard(page: Page, noteTitle: string) {
  return page
    .getByText(noteTitle, { exact: true })
    .locator(
      "xpath=ancestor::div[contains(@class,'border-border') and contains(@class,'p-3') and contains(@class,'rounded-sm')][1]"
    );
}

/**
 * Stable studio list card locator for a note title.
 * Prefer {@link firstStudioNoteCard} when the report title may change after generation (LLM title).
 */
export function studioNoteCardByTitle(page: Page, noteTitle: string) {
  return studioNoteCard(page, noteTitle);
}

/** First card in the Studio "Saved" list — correct for E2E notebooks that create a single note. */
export function firstStudioNoteCard(page: Page) {
  return page.getByTestId("studio-note-card").first();
}

/**
 * Click a studio tool card in the grid.
 * Scoped to the grid so labels like "Quiz" do not match chat chips (e.g. "Quiz me on this material").
 */
export async function openStudioTool(page: Page, toolLabel: string) {
  await openStudioPanel(page);
  await studioGrid(page).getByRole("button", { name: toolLabel, exact: true }).click();
}

/**
 * Wait for a note to reach the given status.
 * Polls the note list for the note title and checks aria/status attributes.
 */
export async function waitForNoteStatus(
  page: Page,
  noteTitle: string,
  expectedStatus: "generating" | "ready" | "failed",
  timeout = 120_000
) {
  await openStudioPanel(page);

  const noteEl = studioNoteCard(page, noteTitle);

  if (expectedStatus === "generating") {
    // Generating notes have aria-busy="true"
    await expect(noteEl).toHaveAttribute("aria-busy", "true", { timeout });
  } else if (expectedStatus === "ready") {
    // Ready notes are no longer aria-busy and can be clicked
    await expect(noteEl).not.toHaveAttribute("aria-busy", "true", { timeout });
  } else if (expectedStatus === "failed") {
    // Failed notes show error text
    await expect(noteEl.getByText(/error|failed/i)).toBeVisible({ timeout });
  }
}

/**
 * Wait for a generating note to reach a minimum progress percentage.
 */
export async function waitForNoteProgress(
  page: Page,
  noteTitle: string,
  minPercent: number,
  timeout = 30_000
) {
  await openStudioPanel(page);

  const noteEl = studioNoteCard(page, noteTitle);
  const progressbar = noteEl.locator('[role="progressbar"]');

  await expect(progressbar).toBeVisible({ timeout });
  await expect(progressbar).toHaveAttribute(
    "aria-valuenow",
    (val: string | null) => val !== null && parseInt(val) >= minPercent,
    { timeout }
  );
}

/**
 * Delete a note via the kebab menu.
 */
export async function deleteNote(page: Page, noteTitle: string) {
  await openStudioPanel(page);

  const noteEl = studioNoteCard(page, noteTitle);
  await noteEl.scrollIntoViewIfNeeded();
  await noteEl.getByLabel("More options").click();
  // The menu is portaled to body
  await page.locator("[data-note-item-menu]").getByText("Delete").click();
  // useNoteActions.handleDeleteNote opens ConfirmDialog (title "Delete Note")
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
}

/**
 * Rename a note via the kebab menu.
 */
export async function renameNote(page: Page, noteTitle: string, newTitle: string) {
  await openStudioPanel(page);

  const noteEl = studioNoteCard(page, noteTitle);
  await noteEl.scrollIntoViewIfNeeded();
  await noteEl.getByLabel("More options").click();
  await page.locator("[data-note-item-menu]").getByText("Rename").click();

  // Inline edit input
  const input = page.getByLabel("Edit note title");
  await input.clear();
  await input.fill(newTitle);
  await input.press("Enter");
}
