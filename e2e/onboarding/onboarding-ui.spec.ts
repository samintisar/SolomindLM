import { randomUUID } from "crypto";
import { test, expect } from "../fixtures/notebook.fixture";
import { test as authTest, expect as expectAuth } from "../fixtures/auth.fixture";
import { expectFixedBackdropZIndex100 } from "../helpers/onboarding-assertions";
import { tryDeleteNotebookByTitleFromHome } from "../helpers/notebook-cleanup";

test.describe("Onboarding UI", () => {
  test("chat composer exposes data-onboarding anchor wrapping the textarea", async ({
    notebookPage,
  }) => {
    const anchor = notebookPage.locator('[data-onboarding="chat-input"]');
    await expect(anchor).toBeVisible();
    await expect(anchor.locator("textarea")).toBeVisible();
  });

  test("share modal backdrop uses z-index 100 for tour stacking", async ({ notebookPage }) => {
    await notebookPage.getByRole("button", { name: /Share/ }).click();
    await expectFixedBackdropZIndex100(notebookPage, "Share notebook");
    const shareDialog = notebookPage.getByRole("dialog", { name: /Share notebook/i });
    await shareDialog.getByRole("button", { name: "Close", exact: true }).click();
  });
});

authTest.describe("Onboarding UI (home)", () => {
  authTest("customize notebook modal backdrop uses z-index 100", async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    const title = `e2e-onboard-${randomUUID().slice(0, 8)}`;

    await page.getByText("Create new notebook").first().click();
    await page.getByPlaceholder("Notebook title").fill(title);
    await page.getByRole("button", { name: "Create" }).click();
    await expectAuth(page.getByText(title, { exact: true })).toBeVisible({ timeout: 45_000 });

    const card = page
      .locator("div.group")
      .filter({ has: page.getByText(title, { exact: true }) })
      .first();
    await card.hover();
    await card.locator(".kebab-menu button").first().click();
    await page.getByRole("button", { name: "Customize" }).click();

    await expectFixedBackdropZIndex100(page, "Customize notebook");

    await page
      .getByRole("heading", { name: "Customize notebook" })
      .locator("..")
      .getByRole("button")
      .first()
      .click();

    await tryDeleteNotebookByTitleFromHome(page, title);
  });
});
