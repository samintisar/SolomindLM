import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { openAddSourceModal } from "./navigation";

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
 * Add a paste-text source: opens the dialog, clicks "Copied text", fills the title and textarea,
 * submits. Returns the title, which locates the source's row.
 *
 * The source always gets a typed title: with a blank one, processing replaces the placeholder
 * with a title generated from the text, which a test cannot predict. The default is unique per
 * call so the row never matches another source.
 */
export async function addPasteTextSource(
  page: Page,
  text: string,
  title = `E2E pasted text ${Date.now()}`
): Promise<string> {
  await openAddSourceModal(page);

  // The dialog is named by its title, which changes once a step is chosen
  const menu = page.getByRole("dialog", { name: "Add sources" });
  await expect(menu).toBeVisible();

  // Click the "Copied text" button
  await menu.getByRole("button", { name: "Copied text", exact: true }).click();

  // The text step replaces the menu inside the same (only) dialog
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByPlaceholder("Paste your text here...")).toBeVisible();

  await dialog.getByLabel("Title (optional)").fill(title);

  // fill() rather than typing: the studio seed is thousands of characters, and typing them
  // used up most of a test's budget
  const textarea = dialog.getByPlaceholder("Paste your text here...");
  await textarea.fill(text);
  await expect(textarea).toHaveValue(text);

  // Submit
  await dialog.getByRole("button", { name: "Add Source", exact: true }).click();

  // Wait for the dialog to close (confirms submission succeeded)
  await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  return title;
}

/**
 * Add a URL source: opens the dialog, clicks "Website", fills the URL input, submits.
 */
export async function addUrlSource(page: Page, url: string) {
  await openAddSourceModal(page);

  // The dialog is named by its title, which changes once a step is chosen
  const menu = page.getByRole("dialog", { name: "Add sources" });
  await expect(menu).toBeVisible();

  // Click the "Website" button
  await menu.getByRole("button", { name: "Website", exact: true }).click();

  // The website step replaces the menu inside the same (only) dialog
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByPlaceholder(/https:\/\/example\.com/)).toBeVisible();

  // Fill the URL textarea
  await dialog.getByPlaceholder(/https:\/\/example\.com/).fill(url);

  // Submit
  await dialog.getByRole("button", { name: "Add Sources", exact: true }).click();
}

/** How long a new source may stay pending before its processing job starts. */
const PROCESSING_START_TIMEOUT = 10_000;

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
    // A new source is "pending" until its processing job starts, and neither pending nor
    // completed rows show a badge. So first wait for the Processing badge, which the job sets
    // as its first step (it starts within seconds of the upload).
    const processing = sourceCard.getByText("Processing");
    await expect(processing)
      .toBeVisible({ timeout: Math.min(PROCESSING_START_TIMEOUT, remaining()) })
      .catch(() => {
        // Never seen: the job finished between polls
      });
    await expect(processing).not.toBeVisible({ timeout: remaining() });
    // A failed source loses the Processing badge too
    await expect(sourceCard.getByText("Failed")).not.toBeVisible();
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
