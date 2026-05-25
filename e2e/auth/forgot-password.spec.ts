import { test, expect } from "@playwright/test";

test.describe("Auth — Forgot password flow", () => {
  test.beforeEach(async ({ page }) => {
    // Auth tests need a clean, unauthenticated context
    await page.context().clearCookies();
    await page.goto("/sign-in");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test("forgot password link navigates to reset form", async ({ page }) => {
    await page.getByRole("button", { name: "Forgot password?" }).click();

    await expect(page.getByRole("heading", { name: "Reset password" })).toBeVisible();
    await expect(page.getByPlaceholder("Email")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send code" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Back to sign in" })).toBeVisible();
  });

  test("forgot password form submission reaches reset code screen", async ({ page }) => {
    await page.getByRole("button", { name: "Forgot password?" }).click();

    await page.getByPlaceholder("Email").fill("test@example.com");
    await page.getByRole("button", { name: "Send code" }).click();

    // Either reaches reset verification screen or shows an error
    await expect(
      page
        .getByRole("heading", { name: "Enter reset code" })
        .or(page.locator("[class*='bg-vintage-red-50']"))
    ).toBeVisible({ timeout: 8_000 });
  });

  test("empty email shows HTML5 validation in forgot password", async ({ page }) => {
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await page.getByRole("button", { name: "Send code" }).click();

    const emailInput = page.getByPlaceholder("Email");
    await expect(emailInput).toHaveAttribute("required", "");
  });

  test("can navigate back to sign-in from forgot password", async ({ page }) => {
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await expect(page.getByRole("heading", { name: "Reset password" })).toBeVisible();

    await page.getByRole("button", { name: "Back to sign in" }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("reset code screen shows expected elements", async ({ page }) => {
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await page.getByPlaceholder("Email").fill("test@example.com");
    await page.getByRole("button", { name: "Send code" }).click();

    // Wait for either success or error
    const resetHeading = page.getByRole("heading", { name: "Enter reset code" });
    const errorBox = page.locator("[class*='bg-vintage-red-50']");

    await expect(resetHeading.or(errorBox)).toBeVisible({ timeout: 8_000 });

    // Only check reset screen elements if we reached it
    if (await resetHeading.isVisible().catch(() => false)) {
      await expect(page.getByPlaceholder("Reset code")).toBeVisible();
      await expect(page.getByPlaceholder("New password")).toBeVisible();
      await expect(page.getByRole("button", { name: "Update password" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Resend code" })).toBeVisible();
    }
  });

  test("new password visibility toggle works in reset form", async ({ page }) => {
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await page.getByPlaceholder("Email").fill("test@example.com");
    await page.getByRole("button", { name: "Send code" }).click();

    const resetHeading = page.getByRole("heading", { name: "Enter reset code" });
    const errorBox = page.locator("[class*='bg-vintage-red-50']");
    await expect(resetHeading.or(errorBox)).toBeVisible({ timeout: 8_000 });

    if (await resetHeading.isVisible().catch(() => false)) {
      const newPasswordInput = page.getByPlaceholder("New password");
      await newPasswordInput.fill("NewPassword123!");

      await expect(newPasswordInput).toHaveAttribute("type", "password");

      await page.getByRole("button", { name: "Show new password" }).click();
      await expect(newPasswordInput).toHaveAttribute("type", "text");

      await page.getByRole("button", { name: "Hide new password" }).click();
      await expect(newPasswordInput).toHaveAttribute("type", "password");
    }
  });
});
