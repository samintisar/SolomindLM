import {
  FREE_PLAN_FEATURES,
  PRO_PLAN_FEATURES,
} from "../../apps/web/src/features/billing/planFeatures";
import { expect, test } from "../fixtures/auth.fixture";

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

    // Feature lists (first line of each plan is the notebook and source limit)
    await expect(page.getByText(FREE_PLAN_FEATURES[0], { exact: true }).first()).toBeVisible();
    await expect(page.getByText(PRO_PLAN_FEATURES[0], { exact: true }).first()).toBeVisible();
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

    // Only the subscribed interval's Pro card shows "Current Plan"; the other offers a switch
    await expect(page.getByRole("button", { name: "Current Plan" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: /^Switch to (Monthly|Yearly)$/ })).toHaveCount(1);
  });

  test("displays correct feature comparisons", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.goto("/billing");
    await page.waitForLoadState("networkidle");

    // Every plan line renders; the lists come from the backend limit tables
    for (const feature of [...FREE_PLAN_FEATURES, ...PRO_PLAN_FEATURES]) {
      await expect(page.getByText(feature, { exact: true }).first()).toBeVisible();
    }
  });
});
