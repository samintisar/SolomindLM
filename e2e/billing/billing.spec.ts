import type { Page } from "@playwright/test";
import {
  FREE_PLAN_FEATURES,
  PRO_PLAN_FEATURES,
} from "../../apps/web/src/features/billing/planFeatures";
import { expect, test } from "../fixtures/auth.fixture";

/** The current-plan section's "<Interval> billing" line. */
const BILLING_LINE = /^(Monthly|Yearly) billing$/;

/** The pricing card whose heading is `title` ("Free", "Yearly" or "Monthly"). */
function planCard(page: Page, title: string) {
  return page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}

test.describe("Billing page", () => {
  test("loads and displays pricing plans", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.goto("/billing");

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
  });

  test("navigates from home via Pro button", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.goto("/home");

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
    await expect(page.getByRole("heading", { name: "Choose Your Plan" })).toBeVisible();

    await page.getByRole("button", { name: /Back/ }).click();

    await expect(page).toHaveURL("/home");
  });

  test("shows subscription management for active subscribers", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.goto("/billing");

    // Current plan section is visible for subscribers
    await expect(page.getByRole("heading", { name: "Pro Plan" })).toBeVisible();
    const billingLine = page.getByText(BILLING_LINE);
    await expect(billingLine).toBeVisible();

    // Free card shows "Downgrade" button for subscribers
    await expect(page.getByRole("button", { name: "Downgrade" })).toBeVisible();

    // The subscribed interval's card shows "Current Plan"; the other card offers a switch
    const current = BILLING_LINE.exec((await billingLine.textContent()) ?? "")?.[1];
    if (!current) throw new Error("Could not read the subscribed interval from the billing line");
    const other = current === "Monthly" ? "Yearly" : "Monthly";
    await expect(
      planCard(page, current).getByRole("button", { name: "Current Plan" })
    ).toBeDisabled();
    await expect(
      planCard(page, other).getByRole("button", { name: `Switch to ${other}` })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Current Plan" })).toHaveCount(1);
  });

  test("displays correct feature comparisons", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.goto("/billing");

    // Each card lists exactly its plan's lines. This checks the page wiring; the limit values
    // themselves are pinned by apps/web/src/features/billing/planFeatures.test.ts.
    await expect(planCard(page, "Free").getByRole("listitem")).toHaveText(FREE_PLAN_FEATURES);
    for (const title of ["Yearly", "Monthly"]) {
      await expect(planCard(page, title).getByRole("listitem")).toHaveText(PRO_PLAN_FEATURES);
    }
  });
});
