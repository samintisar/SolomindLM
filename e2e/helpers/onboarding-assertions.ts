import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Asserts the full-screen modal backdrop ancestor of a heading uses z-index 100
 * (Tailwind `z-100`), matching onboarding/tour overlay stacking.
 */
export async function expectFixedBackdropZIndex100(
  page: Page,
  headingName: string | RegExp,
): Promise<void> {
  const heading = page.getByRole("heading", { name: headingName });
  await expect(heading).toBeVisible();
  const backdrop = heading
    .locator("xpath=ancestor::div[contains(@class,'fixed')][contains(@class,'inset-0')]")
    .first();
  await expect(backdrop).toBeVisible();
  const z = await backdrop.evaluate((el) => getComputedStyle(el).zIndex);
  expect(z).toBe("100");
}
