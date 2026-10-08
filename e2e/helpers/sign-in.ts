import type { Page } from "@playwright/test";

/** Sign in with the e2e test account's password and wait for /home. */
export async function signInWithPassword(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByPlaceholder("Enter your email").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Continue with email" }).click();

  try {
    await page.waitForURL("/home", { timeout: 10_000 });
  } catch {
    throw new Error(
      "E2E sign-in did not reach /home (verification screen?). Ensure the test account is already verified."
    );
  }
}
