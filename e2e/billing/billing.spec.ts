import { test, expect } from "../fixtures/auth.fixture";

test.describe("Billing page", () => {
  test("loads and displays pricing plans", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.goto("/billing");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Choose Your Plan" })).toBeVisible();

    // All three plan cards are visible
    await expect(page.getByRole("heading", { name: "Free" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Yearly" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Monthly" })).toBeVisible();

    // Pricing is displayed
    await expect(page.getByText("$0").first()).toBeVisible();
    await expect(page.getByText("Save 50%")).toBeVisible();
    await expect(page.getByText("$7.50").first()).toBeVisible();
    await expect(page.getByText("$15").first()).toBeVisible();

    // Feature lists
    await expect(page.getByText("20 notebooks per account").first()).toBeVisible();
    await expect(page.getByText("200 notebooks per account").first()).toBeVisible();
  });

  test("navigates from home via Pro button", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    // Subscribed users see "Pro" button in header
    const proBtn = page.getByRole("button", { name: "Pro" });
    await expect(proBtn).toBeVisible();
    await proBtn.click();

    await expect(page).toHaveURL("/billing");
    await expect(page.getByRole("heading", { name: "Choose Your Plan" })).toBeVisible();
  });

  test("back button returns to home page", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.goto("/billing");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Choose Your Plan" })).toBeVisible();

    await page.getByRole("button", { name: /Back/ }).click();

    await expect(page).toHaveURL("/home");
  });

  test("shows subscription management for active subscribers", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.goto("/billing");
    await page.waitForLoadState("networkidle");

    // Current plan section is visible for subscribers
    await expect(page.getByRole("heading", { name: "Pro Plan" })).toBeVisible();
    await expect(page.getByText(/billing/i).first()).toBeVisible();

    // Free card shows "Downgrade" button for subscribers
    await expect(page.getByRole("button", { name: "Downgrade" })).toBeVisible();

    // Both Pro cards show "Current Plan" (disabled) for subscribers
    const currentPlanButtons = page.getByRole("button", { name: "Current Plan" });
    await expect(currentPlanButtons).toHaveCount(2);
  });

  test("displays correct feature comparisons", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.goto("/billing");
    await page.waitForLoadState("networkidle");

    // Free features - just check they exist somewhere on page
    await expect(page.getByText("50 chat messages/day").first()).toBeVisible();
    await expect(page.getByText("5 flashcards/day").first()).toBeVisible();
    await expect(page.getByText("5 quizzes/day").first()).toBeVisible();

    // Pro features - just check they exist somewhere on page
    await expect(page.getByText("500 chat messages/day").first()).toBeVisible();
    await expect(page.getByText("100 flashcards/day").first()).toBeVisible();
    await expect(page.getByText("100 quizzes/day").first()).toBeVisible();
    await expect(page.getByText("100 reports/day").first()).toBeVisible();
    await expect(page.getByText("100 audio overviews/day").first()).toBeVisible();
    await expect(page.getByText("100 written questions/day").first()).toBeVisible();
  });
});
