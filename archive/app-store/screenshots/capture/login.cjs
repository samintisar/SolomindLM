// Opens a headed Chromium with a persistent profile so the user can sign in to solomindlm.com.
// Waits until the app reaches /home, then closes (the session stays in the profile dir).
const { chromium } = require("playwright-core");
const path = require("path");

const { BASE } = require("./lib.cjs");
const APP_HOST = new URL(BASE).hostname;

(async () => {
  const profile = path.join(__dirname, "profile");
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: false,
    viewport: { width: 1280, height: 860 },
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(`${BASE}/sign-in`);
  console.log("Waiting for sign-in (up to 15 min)...");
  // Exact host match: OAuth pages carry the app URL in their own query strings.
  await page.waitForURL(
    (u) => u.hostname === APP_HOST && u.pathname.startsWith("/home"),
    { timeout: 15 * 60_000 }
  );
  await page.waitForTimeout(3000);
  console.log("Signed in:", page.url());
  await ctx.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
