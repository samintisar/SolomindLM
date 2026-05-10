import { test, expect } from "../fixtures/auth.fixture";

test.describe("Billing page", () => {
  test("loads and displays free plan for non-subscribed users", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.goto("/billing");

    await expect(page.getByRole("heading", { name: "Choose Your Plan" })).toBeVisible();
    await expect(page.getByText("Unlock unlimited access to all SolomindLM features")).toBeVisible();

    // Free plan card
    await expect(page.getByRole("heading", { name: "Free" })).toBeVisible();
    await expect(page.getByText("$0", { exact: true })).toBeVisible();
    await expect(page.getByText("Current Plan")).toBeVisible();

    // Pro plans
    await expect(page.getByRole("heading", { name: "Yearly" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Monthly" })).toBeVisible();
    await expect(page.getByText("Save 50%")).toBeVisible();
    await expect(page.getByText("$7.50", { exact: true })).toBeVisible();
    await expect(page.getByText("$15", { exact: true })).toBeVisible();

    // Feature lists
    await expect(page.getByText("20 notebooks per account")).toBeVisible();
    await expect(page.getByText("200 notebooks per account")).toBeVisible();
  });

  test("navigates from home via Upgrade to Pro button", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.goto("/home");

    const upgradeBtn = page.getByRole("button", { name: "Upgrade to Pro" });
    await expect(upgradeBtn).toBeVisible();
    await upgradeBtn.click();

    await expect(page).toHaveURL("/billing");
    await expect(page.getByRole("heading", { name: "Choose Your Plan" })).toBeVisible();
  });

  test("back button returns to home page", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.goto("/billing");
    await expect(page.getByRole("heading", { name: "Choose Your Plan" })).toBeVisible();

    await page.getByRole("button", { name: /Back/ }).click();

    await expect(page).toHaveURL("/home");
  });

  test("shows Get Started buttons for Pro plans when on free tier", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.goto("/billing");

    const getStartedButtons = page.getByRole("button", { name: "Get Started" });
    await expect(getStartedButtons).toHaveCount(2);

    // Yearly and Monthly should both have Get Started buttons
    const yearlyCard = page.locator("div").filter({ hasText: /Yearly/ }).first();
    const monthlyCard = page.locator("div").filter({ hasText: /Monthly/ }).first();

    await expect(yearlyCard.getByRole("button", { name: "Get Started" })).toBeVisible();
    await expect(monthlyCard.getByRole("button", { name: "Get Started" })).toBeVisible();
  });

  test("displays correct feature comparisons", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.goto("/billing");

    // Free features
    await expect(page.getByText("50 chat messages/day")).toBeVisible();
    await expect(page.getByText("5 flashcards/day")).toBeVisible();
    await expect(page.getByText("5 quizzes/day")).toBeVisible();

    // Pro features (higher limits)
    await expect(page.getByText("500 chat messages/day")).toBeVisible();
    await expect(page.getByText("100 flashcards/day")).toBeVisible();
    await expect(page.getByText("100 quizzes/day")).toBeVisible();
    await expect(page.getByText("100 reports/day")).toBeVisible();
    await expect(page.getByText("100 audio overviews/day")).toBeVisible();
    await expect(page.getByText("100 written questions/day")).toBeVisible();
  });
});
