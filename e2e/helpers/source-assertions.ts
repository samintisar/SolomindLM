import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { openAddSourceModal } from "./navigation";

/** Default title for paste-text sources (set by the backend). */
export const PASTED_TEXT_TITLE = "Pasted Text";

/**
 * Get the root source card element by title.
 * Navigates from the source title text up to the nearest ancestor div with
 * the 'rounded-lg' class, which is the SourceListItem root element.
 */
export function getSourceCard(page: Page, sourceTitle: string | RegExp) {
  return page
    .getByText(sourceTitle, { exact: typeof sourceTitle === "string" })
    .locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]")
    .first();
}

/**
 * Add a paste-text source: opens modal, clicks "Copied text", fills textarea, submits.
 * After calling this, use waitForSourceStatus(page, PASTED_TEXT_TITLE, ...) to wait for completion.
 */
export async function addPasteTextSource(page: Page, text: string) {
  await openAddSourceModal(page);

  // Wait for modal to be interactable before clicking inside it
  await expect(page.getByText("Add sources")).toBeVisible();

  // Click the "Copied text" button
  await page.getByRole("button", { name: "Copied text" }).click();

  // Wait for TextInputModal to open
  await expect(page.getByPlaceholder("Paste your text here...")).toBeVisible();

  // Fill the textarea using pressSequentially for reliable React state updates
  const textarea = page.getByPlaceholder("Paste your text here...");
  await textarea.click();
  await textarea.pressSequentially(text, { delay: 2 });

  // Submit
  await page.getByRole("button", { name: "Add Source" }).last().evaluate((el) => (el as HTMLElement).click());

  // Wait for modal to close (confirms submission succeeded)
  await expect(page.getByPlaceholder("Paste your text here...")).not.toBeVisible({ timeout: 5_000 });
}

/**
 * Add a URL source: opens modal, clicks "Website", fills URL input, submits.
 */
export async function addUrlSource(page: Page, url: string) {
  await openAddSourceModal(page);

  // Wait for modal to be interactable
  await expect(page.getByText("Add sources")).toBeVisible();

  // Click the "Website" button
  await page.getByRole("button", { name: "Website" }).click();

  // Wait for URL input modal
  await expect(page.getByPlaceholder(/https:\/\/example\.com/)).toBeVisible();

  // Fill the URL textarea
  await page.getByPlaceholder(/https:\/\/example\.com/).fill(url);

  // Submit
  await page.getByRole("button", { name: "Add Sources" }).click();
}

/**
 * Wait for a source to reach the given status.
 * Polls the source card for the status badge text.
 *
 * `timeout` is a single wall-clock budget for both “card visible” and status transition.
 */
export async function waitForSourceStatus(
  page: Page,
  sourceTitle: string | RegExp,
  expectedStatus: "completed" | "processing" | "failed",
  timeout = 60_000
) {
  const sourceCard = getSourceCard(page, sourceTitle);
  const start = Date.now();
  const remaining = () => Math.max(1_000, timeout - (Date.now() - start));

  // First ensure the card actually exists
  await expect(sourceCard).toBeVisible({ timeout: remaining() });

  if (expectedStatus === "completed") {
    // Completed sources don't show a status badge — wait for processing badge to disappear
    await expect(sourceCard.getByText("Processing")).not.toBeVisible({ timeout: remaining() });
  } else if (expectedStatus === "processing") {
    await expect(sourceCard.getByText("Processing")).toBeVisible({ timeout: remaining() });
  } else if (expectedStatus === "failed") {
    await expect(sourceCard.getByText("Failed")).toBeVisible({ timeout: remaining() });
  }
}

/**
 * Select a source by clicking its checkbox area (Square/CheckSquare icon).
 * Uses dispatchEvent to bypass ChatEmptyState overlay.
 */
export async function selectSource(page: Page, sourceTitle: string | RegExp) {
  const sourceCard = getSourceCard(page, sourceTitle);
  const checkbox = sourceCard.locator("div.text-primary").first();
  await checkbox.dispatchEvent("click");
}

/**
 * Delete a source via the kebab menu. Handles the confirmation dialog automatically.
 */
export async function deleteSource(page: Page, sourceTitle: string | RegExp) {
  await openSourceKebab(page, sourceTitle);
  // Click "Delete" in the kebab dropdown (evaluate bypasses ChatEmptyState overlay)
  await page.getByText("Delete").first().evaluate((el) => (el as HTMLElement).click());

  // Confirmation dialog appears — click the dialog's "Delete" button
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await dialog.getByRole("button", { name: "Delete" }).click();
}

/**
 * Click the kebab (More options) menu on a source card.
 */
export async function openSourceKebab(page: Page, sourceTitle: string | RegExp) {
  const sourceCard = getSourceCard(page, sourceTitle);
  await sourceCard.locator('[title="More options"]').evaluate((el) => (el as HTMLElement).click());
}
