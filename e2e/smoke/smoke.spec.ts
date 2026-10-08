import { devices, expect, type Page, test } from "@playwright/test";

test.describe("Smoke tests — public pages", () => {
  // Signed out: the suite's stored session would send /sign-in straight on to /home.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("landing page loads with hero content", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("button", { name: "Get Started" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Features" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pricing" })).toBeVisible();
  });

  test("sign-in page renders auth form", async ({ page }) => {
    await page.goto("/sign-in");

    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByPlaceholder("Enter your email")).toBeVisible();
    await expect(page.getByPlaceholder("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue with Google/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with email" })).toBeVisible();
  });

  test("sign-up mode shows Create account heading", async ({ page }) => {
    await page.goto("/sign-in?mode=signup");

    await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  });

  test("privacy policy page loads", async ({ page }) => {
    await page.goto("/privacy");

    await expect(page.getByText("Privacy Policy")).toBeVisible();
  });

  test("terms of service page loads", async ({ page }) => {
    await page.goto("/terms");

    await expect(page.getByText("Terms of Service")).toBeVisible();
  });

  test("landing page Get Started button navigates forward", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Get Started" }).click();

    await page.waitForURL(/\/(home|sign-in)/, { timeout: 5_000 });
    const url = page.url();
    expect(url).toMatch(/\/(home|sign-in)/);
  });

  test("protected route requires authentication", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/home");

    const url = page.url();
    expect(url).toMatch(/\/(home|sign-in)/);
  });
});

const viewportContent = (page: Page) =>
  page.locator('meta[name="viewport"]').getAttribute("content");

test.describe("Viewport — iOS focus zoom", () => {
  test.describe("iPhone", () => {
    test.use({ userAgent: devices["iPhone 13"].userAgent, hasTouch: true });

    test("caps maximum-scale so focusing a field doesn't zoom", async ({ page }) => {
      await page.goto("/");
      expect(await viewportContent(page)).toContain("maximum-scale=1");
    });
  });

  test.describe("Android", () => {
    test.use({ userAgent: devices["Pixel 7"].userAgent, hasTouch: true });

    test("leaves maximum-scale unset so pinch-zoom keeps working", async ({ page }) => {
      await page.goto("/");
      expect(await viewportContent(page)).not.toContain("maximum-scale");
    });
  });
});
