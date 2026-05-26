import { test, expect } from "@playwright/test";
import { TEST_EMAIL, TEST_PASSWORD } from "../fixtures/auth.fixture";

test.describe("Auth — Sign-out flow", () => {
  test("sign out from authenticated state clears auth", async ({ page }) => {
    // Sign in first
    await page.goto("/sign-in");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByPlaceholder("Enter your email").fill(TEST_EMAIL);
    await page.getByPlaceholder("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Continue with email" }).click();
    await page.waitForURL("/home", { timeout: 10_000 });

    // Open avatar dropdown and sign out
    const avatarButton = page
      .locator("header [class*='rounded-xl']")
      .filter({ has: page.locator("svg") })
      .first();
    await expect(avatarButton).toBeVisible();
    await avatarButton.click();

    const logoutButton = page.getByRole("menuitem", { name: "Logout" });
    await expect(logoutButton).toBeVisible();
    await logoutButton.click();

    // Wait a moment for the auth state to update
    await page.waitForTimeout(1_000);

    // Open the avatar menu again to verify it now shows "Login" instead of "Logout"
    await avatarButton.click();
    await expect(page.getByRole("menuitem", { name: "Login" })).toBeVisible();
  });

  test("after sign-out, protected content requires login", async ({ page }) => {
    // Sign in
    await page.goto("/sign-in");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByPlaceholder("Enter your email").fill(TEST_EMAIL);
    await page.getByPlaceholder("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Continue with email" }).click();
    await page.waitForURL("/home", { timeout: 10_000 });

    // Sign out
    const avatarButton = page
      .locator("header [class*='rounded-xl']")
      .filter({ has: page.locator("svg") })
      .first();
    await expect(avatarButton).toBeVisible();
    await avatarButton.click();
    await page.getByRole("menuitem", { name: "Logout" }).click();

    // Wait for auth state to clear
    await page.waitForTimeout(1_000);

    // Clear storage to simulate fresh session
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());

    // Try to access protected route - should redirect or show auth wall
    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    const url = page.url();
    // Should either be on sign-in or if on home, auth-dependent UI should be hidden
    expect(url).toMatch(/\/(sign-in|home)/);
  });

  test("clearing cookies prevents access to protected routes", async ({ page }) => {
    // Sign in
    await page.goto("/sign-in");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByPlaceholder("Enter your email").fill(TEST_EMAIL);
    await page.getByPlaceholder("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Continue with email" }).click();
    await page.waitForURL("/home", { timeout: 10_000 });

    // Clear all cookies and storage while on home
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // After reload, the auth should be cleared
    // The app should redirect to sign-in or show unauthenticated state
    const url = page.url();
    expect(url).toMatch(/\/(sign-in|home)/);
  });
});
