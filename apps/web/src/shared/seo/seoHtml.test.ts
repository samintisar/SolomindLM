import { describe, expect, it } from "vitest";
import { getIntentLandingPaths } from "@/features/landing/intentLandingPages";
import { getPublicSeoPageByPath } from "./publicSeoPages";
import { SEO_BASE_URL } from "./seoConstants";
import { applySeoToHtml, canonicalUrl, seoPageToHeadInput } from "./seoHtml";

const MINIMAL_HTML = `<!doctype html>
<html lang="en">
  <head>
    <title>Old Title</title>
    <meta name="description" content="Old description" />
    <link rel="canonical" href="https://example.com/" />
  </head>
  <body><div id="root"></div></body>
</html>`;

describe("canonicalUrl", () => {
  it("normalizes root path", () => {
    expect(canonicalUrl(SEO_BASE_URL, "/")).toBe(`${SEO_BASE_URL}/`);
  });

  it("joins nested paths", () => {
    expect(canonicalUrl(SEO_BASE_URL, "/privacy")).toBe(`${SEO_BASE_URL}/privacy`);
  });
});

describe("applySeoToHtml", () => {
  it("injects privacy page title and canonical", () => {
    const page = getPublicSeoPageByPath("/privacy");
    expect(page).toBeDefined();

    const html = applySeoToHtml(MINIMAL_HTML, SEO_BASE_URL, seoPageToHeadInput(page!));

    expect(html).toContain("<title>Privacy Policy - SolomindLM</title>");
    expect(html).toContain(`rel="canonical" href="${SEO_BASE_URL}/privacy"`);
    expect(html).toContain('name="robots" content="index, follow"');
  });

  it("injects JSON-LD for homepage", () => {
    const page = getPublicSeoPageByPath("/");
    expect(page).toBeDefined();

    const html = applySeoToHtml(MINIMAL_HTML, SEO_BASE_URL, seoPageToHeadInput(page!));

    expect(html).toContain('type="application/ld+json"');
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).not.toContain("SearchAction");
  });
});

describe("intent landing SEO registry", () => {
  it("registers all intent landing pages in the SEO registry", () => {
    for (const path of getIntentLandingPaths()) {
      expect(getPublicSeoPageByPath(path)).toBeDefined();
    }
  });
});
