import { expect, type Page, test } from "@playwright/test";

/**
 * Screenshot baselines for the /dev/design gallery: every section, plus the two modal layers
 * that live on their own pages, in light and dark at desktop and phone widths.
 * Linux-only baselines; run via `bun run test:design` (Docker), see playwright.design.config.ts.
 */

const SECTIONS = [
  "Buttons",
  "Tray",
  "Menus",
  "Fields",
  "Cards",
  "Dialogs",
  "Badges and alerts",
  "Toggles",
  "Tables",
] as const;

const LAYERS = [
  { query: "select", slug: "select-list", content: "[data-slot=select-content]" },
  { query: "alert-dialog", slug: "alert-dialog", content: "[data-slot=alert-dialog-content]" },
] as const;

const THEMES = ["light", "dark"] as const;
const WIDTHS = [1440, 390] as const;

type Theme = (typeof THEMES)[number];

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/** Pin the theme before the app boots (ThemeProvider reads localStorage), then load the page. */
async function openGallery(page: Page, theme: Theme, width: number, path: string) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await page.addInitScript((value) => {
    try {
      localStorage.setItem("solomind_theme", value);
    } catch {
      // Storage unavailable: the class toggle below still applies the theme.
    }
  }, theme);
  await page.goto(path);
  if (theme === "dark") {
    await page.evaluate(() => document.documentElement.classList.add("dark"));
  }
  await page.evaluate(() => document.fonts.ready);
}

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    test.describe(`${theme} ${width}`, () => {
      test("gallery sections", async ({ page }) => {
        await openGallery(page, theme, width, "/dev/design");
        await expect(page.locator('[data-gallery-section="Badges and alerts"]')).toBeVisible();
        await page.evaluate(() => document.fonts.ready);

        for (const name of SECTIONS) {
          await expect(page.locator(`[data-gallery-section="${name}"]`)).toHaveScreenshot(
            `${slugify(name)}-${theme}-${width}.png`
          );
        }
      });

      for (const layer of LAYERS) {
        test(`${layer.slug} layer`, async ({ page }) => {
          await openGallery(page, theme, width, `/dev/design?layer=${layer.query}`);
          await expect(page.locator(layer.content)).toBeVisible();
          await page.evaluate(() => document.fonts.ready);

          await expect(page).toHaveScreenshot(`${layer.slug}-${theme}-${width}.png`);
        });
      }
    });
  }
}
