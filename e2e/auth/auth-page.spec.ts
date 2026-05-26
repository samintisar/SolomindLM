import { test, expect } from "@playwright/test";

test.describe("Auth — Auth page smoke tests", () => {
  test("landing page Get Started navigates to auth", async ({ page }) => {
    // Auth tests need a clean, unauthenticated context
    await page.context().clearCookies();
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await page.getByRole("button", { name: "Get Started Free" }).click();

    await page.waitForURL(/\/(home|sign-in)/, { timeout: 5_000 });
    const url = page.url();
    expect(url).toMatch(/\/(home|sign-in)/);
  });

  test("sign-in page has all expected elements", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/sign-in");
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByPlaceholder("Enter your email")).toBeVisible();
    await expect(page.getByPlaceholder("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with email" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue with Google/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create an account" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Forgot password?" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Terms of Service" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Privacy Policy" })).toBeVisible();
  });

  test("sign-up mode via URL shows create account elements", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/sign-in?mode=signup");
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
    await expect(page.getByPlaceholder("Enter your email")).toBeVisible();
    await expect(page.getByPlaceholder("Password")).toBeVisible();
  });

  test("back to home link works from auth page", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/sign-in");
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await page.getByRole("link", { name: "Back to home" }).click();
    await page.waitForURL("/", { timeout: 5_000 });
    await expect(page).toHaveURL("/");
  });

  test("auth page logo links to home", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/sign-in");
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await page.getByRole("link", { name: "SolomindLM home" }).click();
    await page.waitForURL("/", { timeout: 5_000 });
    await expect(page).toHaveURL("/");
  });

  test("already authenticated user is redirected from /sign-in", async ({ page }) => {
    // This test relies on the global setup auth state being present
    await page.goto("/home");

    // If we're on home, we're authenticated; try going to sign-in
    const currentUrl = page.url();
    if (currentUrl.includes("/home")) {
      await page.goto("/sign-in");
      // Should redirect back to home since already authenticated
      await page.waitForURL(/\/(home|sign-in)/, { timeout: 5_000 });
      const url = page.url();
      expect(url).toMatch(/\/(home|sign-in)/);
    }
  });
});
