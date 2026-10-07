import { expect, test } from "@playwright/test";

const NOTES = Array.from({ length: 120 }, (_, i) => `Mitochondria fact ${i} explains ATP.`).join(
  " "
);

// The endpoint lives on the Convex .site host, so the browser sends a CORS preflight first.
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

// The tool is for visitors without an account. The suite-wide signed-in state would also remount
// the page once auth resolves (the app keys its provider on the user id) and wipe the typed notes.
test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async ({ page }) => {
  // Stub Turnstile: render returns an id, execute fires the callback with a dummy token.
  await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.turnstile = {
        _cb: null,
        render(el, opts) { this._cb = opts.callback; return "w1"; },
        execute() { setTimeout(() => this._cb("e2e-token"), 10); },
        reset() {}, remove() {}
      };`,
    })
  );
  await page.route("**/tools/flashcards", async (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: CORS_HEADERS });
    }
    const body = route.request().postDataJSON();
    expect(body.turnstileToken).toBe("e2e-token");
    await route.fulfill({
      contentType: "application/json",
      headers: CORS_HEADERS,
      body: JSON.stringify({
        title: "Mitochondria",
        cards: [
          { type: "wh-question", front: "What do mitochondria make?", back: "ATP", topic: null },
          { type: "definition", front: "Define: mitochondrion", back: "The cell's power plant" },
        ],
      }),
    });
  });
});

test("paste notes → generate → preview → Anki download", async ({ page }) => {
  await page.goto("/tools/pdf-to-flashcards");
  await expect(
    page.getByRole("heading", { level: 1, name: "Free PDF to Flashcards Maker" })
  ).toBeVisible();

  await page.getByRole("tab", { name: "Paste notes" }).click();
  await page.getByLabel("Notes to turn into flashcards").fill(NOTES);
  await page.getByRole("button", { name: "Generate flashcards" }).click();

  await expect(page.getByRole("heading", { name: "Mitochondria", exact: true })).toBeVisible();
  await expect(page.getByText("2 cards")).toBeVisible();
  await expect(page.getByText("What do mitochondria make?").first()).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download for Anki" }).click();
  expect((await download).suggestedFilename()).toBe("mitochondria-flashcards.txt");
});

test("shows the daily-limit message on 429", async ({ page }) => {
  await page.route("**/tools/flashcards", (route) =>
    route.request().method() === "OPTIONS"
      ? route.fulfill({ status: 204, headers: CORS_HEADERS })
      : route.fulfill({
          status: 429,
          contentType: "application/json",
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: "rate_limited", scope: "ip", retryAfterMs: 7_200_000 }),
        })
  );
  await page.goto("/tools/pdf-to-flashcards");
  await page.getByRole("tab", { name: "Paste notes" }).click();
  await page.getByLabel("Notes to turn into flashcards").fill(NOTES);
  await page.getByRole("button", { name: "Generate flashcards" }).click();
  await expect(page.getByText("You've reached today's free limit")).toBeVisible();
});
