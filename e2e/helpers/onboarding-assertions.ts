import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Stacking of the onboarding tour overlay (`z-40`) and checklist card (`z-45`). */
const ONBOARDING_MAX_Z_INDEX = 45;

/**
 * Asserts a Radix dialog is open and stacks above the onboarding tour overlay and checklist
 * card, so it is not covered during the tour.
 */
export async function expectDialogAboveOnboarding(
  page: Page,
  dialogName: string | RegExp
): Promise<void> {
  const dialog = page.getByRole("dialog", { name: dialogName });
  await expect(dialog).toBeVisible();
  const z = await dialog.evaluate((el) => Number.parseInt(getComputedStyle(el).zIndex, 10));
  expect(z).toBeGreaterThan(ONBOARDING_MAX_Z_INDEX);
}
