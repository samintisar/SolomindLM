import { expect, test } from "@playwright/test";
import { TEST_EMAIL, TEST_PASSWORD } from "../fixtures/auth.fixture";

test.describe("Auth — Sign-in flow", () => {
  test.beforeEach(async ({ page }) => {
    // Auth tests need a clean, unauthenticated context
    await page.context().clearCookies();
    await page.goto("/sign-in");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test("sign-in page renders all elements", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByPlaceholder("Enter your email")).toBeVisible();
    await expect(page.getByPlaceholder("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with email" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue with Google/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create an account" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Forgot password?" })).toBeVisible();
  });

  test("sign in with valid credentials navigates to home", async ({ page }) => {
    await page.getByPlaceholder("Enter your email").fill(TEST_EMAIL);
    await page.getByPlaceholder("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Continue with email" }).click();

    await page.waitForURL("/home", { timeout: 10_000 });
    await expect(page).toHaveURL("/home");
  });

  test("sign in with wrong password shows error", async ({ page }) => {
    await page.getByPlaceholder("Enter your email").fill(TEST_EMAIL);
    await page.getByPlaceholder("Password").fill("WrongPassword123!");
    await page.getByRole("button", { name: "Continue with email" }).click();

    const errorLocator = page.locator("text=That password doesn't match this account");
    await expect(errorLocator).toBeVisible({ timeout: 5_000 });
  });

  test("sign in with non-existent email shows error", async ({ page }) => {
    await page.getByPlaceholder("Enter your email").fill("nonexistent@example.com");
    await page.getByPlaceholder("Password").fill("SomePassword123!");
    await page.getByRole("button", { name: "Continue with email" }).click();

    const errorLocator = page.locator("text=We couldn't find an email/password account");
    await expect(errorLocator).toBeVisible({ timeout: 5_000 });
  });

  test("empty email shows HTML5 validation", async ({ page }) => {
    await page.getByPlaceholder("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Continue with email" }).click();

    const emailInput = page.getByPlaceholder("Enter your email");
    await expect(emailInput).toHaveAttribute("required", "");
  });

  test("empty password shows HTML5 validation", async ({ page }) => {
    await page.getByPlaceholder("Enter your email").fill(TEST_EMAIL);
    await page.getByRole("button", { name: "Continue with email" }).click();

    const passwordInput = page.getByPlaceholder("Password");
    await expect(passwordInput).toHaveAttribute("required", "");
  });

  test("password visibility toggle works", async ({ page }) => {
    const passwordInput = page.getByPlaceholder("Password");
    await passwordInput.fill(TEST_PASSWORD);

    // Initially hidden
    await expect(passwordInput).toHaveAttribute("type", "password");

    // Click show password
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(passwordInput).toHaveAttribute("type", "text");

    // Click hide password
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(passwordInput).toHaveAttribute("type", "password");
  });

  test("terms and privacy links navigate correctly", async ({ page }) => {
    await page.getByRole("link", { name: "Terms of Service" }).click();
    await page.waitForURL("/terms");
    await expect(page).toHaveURL("/terms");

    await page.goto("/sign-in");
    await page.getByRole("link", { name: "Privacy Policy" }).click();
    await page.waitForURL("/privacy");
    await expect(page).toHaveURL("/privacy");
  });
});
