import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { openAddSourceModal } from "./navigation";

/** Default title for paste-text sources (set by the backend). */
export const PASTED_TEXT_TITLE = "Pasted Text";

/**
 * Get the source row (shadcn `Item`, `data-slot="item"`) whose text contains the title.
 * While a row is being renamed its title becomes an input, so it no longer matches
 * by text — use the "Rename source" textbox for that window.
 */
export function getSourceCard(page: Page, sourceTitle: string | RegExp) {
  return page.locator('[data-slot="item"]', { hasText: sourceTitle }).first();
}

/**
 * The "Include <title> in chat" checkbox (Radix: role="checkbox" + aria-checked)
 * inside a source row. Assert with toBeChecked() / not.toBeChecked().
 */
export function getSourceCheckbox(page: Page, sourceTitle: string | RegExp) {
  return getSourceCard(page, sourceTitle).getByRole("checkbox");
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
  await page
    .getByRole("button", { name: "Add Source" })
    .last()
    .evaluate((el) => (el as HTMLElement).click());

  // Wait for modal to close (confirms submission succeeded)
  await expect(page.getByPlaceholder("Paste your text here...")).not.toBeVisible({
    timeout: 5_000,
  });
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
 * Toggle a source's "Include in chat" checkbox.
 * Uses dispatchEvent to bypass ChatEmptyState overlay.
 */
export async function selectSource(page: Page, sourceTitle: string | RegExp) {
  await getSourceCheckbox(page, sourceTitle).dispatchEvent("click");
}

/**
 * Delete a source via the kebab menu. Handles the confirmation dialog automatically.
 */
export async function deleteSource(page: Page, sourceTitle: string | RegExp) {
  await openSourceKebab(page, sourceTitle);
  // The menu content portals to the body, so look it up on the page, not the card
  await page.getByRole("menuitem", { name: "Delete" }).click();

  // Confirmation dialog appears — click the dialog's "Delete" button
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await dialog.getByRole("button", { name: "Delete" }).click();
}

/**
 * Open the "More options" menu on a source card. Radix opens the menu on
 * pointerdown, so this needs a real click (a synthetic `click` event is ignored).
 */
export async function openSourceKebab(page: Page, sourceTitle: string | RegExp) {
  const sourceCard = getSourceCard(page, sourceTitle);
  await sourceCard.getByRole("button", { name: "More options" }).click();
}

/**
 * Rename a source through its menu: open the menu, pick Rename, type the new
 * name into the inline "Rename source" textbox and press Enter.
 */
export async function renameSource(page: Page, sourceTitle: string | RegExp, newName: string) {
  await openSourceKebab(page, sourceTitle);
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const renameInput = page.getByRole("textbox", { name: "Rename source" });
  await expect(renameInput).toBeVisible({ timeout: 5_000 });
  await renameInput.fill(newName);
  await renameInput.press("Enter");
}
