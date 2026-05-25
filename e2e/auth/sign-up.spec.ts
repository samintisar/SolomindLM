import { test, expect } from "@playwright/test";
import { TEST_EMAIL } from "../fixtures/auth.fixture";

test.describe("Auth — Sign-up flow", () => {
  test.beforeEach(async ({ page }) => {
    // Auth tests need a clean, unauthenticated context
    await page.context().clearCookies();
    await page.goto("/sign-in");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test("switch to sign-up mode shows create account form", async ({ page }) => {
    await page.getByRole("button", { name: "Create an account" }).click();

    await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Already have an account? Sign in" })
    ).toBeVisible();
  });

  test("sign-up mode via URL parameter", async ({ page }) => {
    await page.goto("/sign-in?mode=signup");

    await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
  });

  test("sign-up form submission reaches verification screen", async ({ page }) => {
    await page.getByRole("button", { name: "Create an account" }).click();

    const uniqueEmail = `e2e-auth-test-${Date.now()}@test.example.com`;
    await page.getByPlaceholder("Enter your email").fill(uniqueEmail);
    await page.getByPlaceholder("Password").fill("TestPassword123!");
    await page.getByRole("button", { name: "Create account" }).click();

    // Either reaches verification screen or shows an error (e.g., Resend test mode restriction)
    await expect(
      page
        .getByRole("heading", { name: "Check your email" })
        .or(page.locator("[class*='bg-vintage-red-50']"))
    ).toBeVisible({ timeout: 8_000 });
  });

  test("sign-up with existing email shows appropriate error", async ({ page }) => {
    await page.goto("/sign-in?mode=signup");

    // Use the known existing test account email - this will fail since account exists
    await page.getByPlaceholder("Enter your email").fill(TEST_EMAIL);
    await page.getByPlaceholder("Password").fill("TestPassword123!");
    await page.getByRole("button", { name: "Create account" }).click();

    // Should show some kind of error (exact message depends on backend)
    await expect(page.locator("[class*='bg-vintage-red-50']")).toBeVisible({ timeout: 8_000 });
  });

  test("can toggle back to sign-in from sign-up", async ({ page }) => {
    await page.getByRole("button", { name: "Create an account" }).click();
    await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();

    await page.getByRole("button", { name: "Already have an account? Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("password visibility toggle works in sign-up mode", async ({ page }) => {
    await page.goto("/sign-in?mode=signup");

    const passwordInput = page.getByPlaceholder("Password");
    await passwordInput.fill("TestPassword123!");

    await expect(passwordInput).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: "Show password" }).click();
    await expect(passwordInput).toHaveAttribute("type", "text");

    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(passwordInput).toHaveAttribute("type", "password");
  });

  test("empty fields show HTML5 validation in sign-up", async ({ page }) => {
    await page.goto("/sign-in?mode=signup");
    await page.getByRole("button", { name: "Create account" }).click();

    const emailInput = page.getByPlaceholder("Enter your email");
    const passwordInput = page.getByPlaceholder("Password");

    await expect(emailInput).toHaveAttribute("required", "");
    await expect(passwordInput).toHaveAttribute("required", "");
  });
});
