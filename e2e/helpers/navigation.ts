import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Open the Add Source modal by clicking the "Add Source" button in the source list.
 */
export async function openAddSourceModal(page: Page) {
  // On mobile, we may need to switch to sources tab first (exact: not "Open Sources" / close panel)
  const sourcesTab = page.getByRole("button", { name: /^Sources$/ });
  if (await sourcesTab.isVisible().catch(() => false)) {
    await sourcesTab.click();
  }

  // The Add Source button always has title="Add Source" in abbreviated/icon-only modes.
  // Use evaluate to click via JS because the ChatEmptyState overlay can intercept pointer events.
  const addBtn = page.locator('[title="Add Source"]').first();
  await addBtn.evaluate((el) => (el as HTMLElement).click());
}

/**
 * Switch to the sources panel on mobile (tab-based layout).
 * On desktop this is a no-op since sources panel is always visible.
 */
export async function openSourcesPanel(page: Page) {
  const sourcesTab = page.getByRole("button", { name: /^Sources$/ });
  if (await sourcesTab.isVisible().catch(() => false)) {
    await sourcesTab.click();
  }
}

/**
 * Ensure the Studio tool grid is visible: expand the column if needed, pick the
 * mobile Studio tab, then wait for the tool grid (list view, not a selected note).
 */
export async function openStudioPanel(page: Page) {
  await expect(page).toHaveURL(/\/notebook\//, { timeout: 10_000 });

  // When the Studio column is collapsed, the whole panel (including the tool grid) is unmounted.
  // When a note is open (ActiveNoteView), the tool grid is also unmounted — go back first.
  // Re-open the column until the grid exists: desktop = chat "Open Studio"; mobile = "Studio" tab.
  for (let attempt = 0; attempt < 10; attempt++) {
    const hasGrid = (await page.getByTestId("studio-tool-grid").count()) > 0;
    if (hasGrid) break;

    const backToStudio = page.getByRole("button", { name: "Back to Studio" });
    if (await backToStudio.isVisible().catch(() => false)) {
      await backToStudio.click();
      await delay(300);
      continue;
    }

    const openDesktop = page.locator('button[title="Open Studio"]');
    if ((await openDesktop.count()) > 0) {
      await openDesktop.first().click();
    } else {
      const studioTab = page.getByRole("button", { name: "Studio" });
      if (await studioTab.isVisible().catch(() => false)) {
        await studioTab.click();
      }
    }
    await delay(200);
  }

  const studioGrid = page.getByTestId("studio-tool-grid");
  const studioByHeading = page.getByRole("heading", { level: 3, name: "Create" });
  const anchor = studioGrid.or(studioByHeading);
  await anchor.first().waitFor({ state: "attached", timeout: 30_000 });
  await anchor.first().scrollIntoViewIfNeeded();
  await expect(anchor.first()).toBeVisible({ timeout: 20_000 });
}
