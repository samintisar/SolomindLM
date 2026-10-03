import { expect, type Page, test } from "@playwright/test";

/**
 * CSP smoke test: load public routes in a clean browser and fail on any
 * `securitypolicyviolation`. Works for both Content-Security-Policy and
 * Content-Security-Policy-Report-Only, because the browser fires the event either way.
 *
 * Needs no login or Convex backend (the placeholder Convex URL only produces network
 * errors, which are not CSP violations). Scripts such as GTM load from the real network;
 * a violation on the first request fires before any fetch, so an offline CI still catches
 * a missing origin, but secondary requests (e.g. GA collect calls) need network to be seen.
 */

type Violation = {
  directive: string;
  blocked: string;
  source: string;
  disposition: string;
};

const PUBLIC_ROUTES = ["/", "/sign-in", "/faq", "/privacy"];

async function recordViolations(page: Page) {
  // addInitScript runs via CDP, so it is not subject to the page's CSP.
  await page.addInitScript(() => {
    const w = window as unknown as { __cspViolations: Violation[] };
    w.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      w.__cspViolations.push({
        directive: event.effectiveDirective,
        blocked: event.blockedURI,
        source: `${event.sourceFile}:${event.lineNumber}`,
        disposition: event.disposition,
      });
    });
  });
}

async function readViolations(page: Page): Promise<Violation[]> {
  return page.evaluate(
    () => (window as unknown as { __cspViolations: Violation[] }).__cspViolations
  );
}

test.describe("Content-Security-Policy", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} has a policy and no violations`, async ({ page }) => {
      await recordViolations(page);

      const response = await page.goto(route, { waitUntil: "load" });
      const headers = response?.headers() ?? {};
      expect(
        headers["content-security-policy"] ?? headers["content-security-policy-report-only"],
        "document response must carry a CSP header"
      ).toBeTruthy();

      // Let async third-party scripts (GTM, Ahrefs) and the Convex client make their requests.
      await page.waitForTimeout(3_000);

      expect(await readViolations(page)).toEqual([]);
    });
  }

  // Guards against a vacuous pass: proves the harness really sees violations.
  test("detects a script from a non-allowed origin", async ({ page }) => {
    await recordViolations(page);
    await page.goto("/", { waitUntil: "load" });

    await page.evaluate(() => {
      const script = document.createElement("script");
      script.src = "https://csp-canary.invalid/blocked.js";
      document.head.appendChild(script);
    });

    await expect
      .poll(async () => (await readViolations(page)).map((v) => v.blocked))
      .toContain("https://csp-canary.invalid/blocked.js");
  });
});
