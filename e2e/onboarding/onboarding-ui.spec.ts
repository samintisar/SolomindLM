import { randomUUID } from "crypto";
import { test as authTest, expect as expectAuth } from "../fixtures/auth.fixture";
import { expect, test } from "../fixtures/notebook.fixture";
import { myNotebooks, tryDeleteNotebookByTitleFromHome } from "../helpers/notebook-cleanup";
import { expectDialogAboveOnboarding } from "../helpers/onboarding-assertions";

test.describe("Onboarding UI", () => {
  test("chat composer exposes data-onboarding anchor wrapping the textarea", async ({
    notebookPage,
  }) => {
    const anchor = notebookPage.locator('[data-onboarding="chat-input"]');
    await expect(anchor).toBeVisible();
    await expect(anchor.locator("textarea")).toBeVisible();
  });

  test("share dialog stacks above the tour", async ({ notebookPage }) => {
    await notebookPage.getByRole("button", { name: /Share/ }).click();
    await expectDialogAboveOnboarding(notebookPage, "Share notebook");
    const shareDialog = notebookPage.getByRole("dialog", { name: /Share notebook/i });
    await shareDialog.getByRole("button", { name: "Close", exact: true }).click();
  });
});

authTest.describe("Onboarding UI (home)", () => {
  authTest("customize notebook dialog stacks above the tour", async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    const title = `e2e-onboard-${randomUUID().slice(0, 8)}`;

    await page.getByRole("button", { name: "New notebook" }).first().click();
    await page.getByPlaceholder("Notebook title").fill(title);
    await page.getByRole("button", { name: "Create" }).click();
    await expectAuth(myNotebooks(page).getByText(title, { exact: true })).toBeVisible({
      timeout: 45_000,
    });

    const card = page.locator('[data-slot="card"]', { hasText: title });
    await card.getByRole("button", { name: "Notebook actions" }).click();
    await page.getByRole("menuitem", { name: "Customize" }).click();

    await expectDialogAboveOnboarding(page, "Customize notebook");

    await page.keyboard.press("Escape");
    await expectAuth(page.getByRole("dialog", { name: "Customize notebook" })).not.toBeVisible();

    await tryDeleteNotebookByTitleFromHome(page, title);
  });
});
