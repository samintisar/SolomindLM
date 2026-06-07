import { describe, expect, it } from "vitest";
import { getClusterHubPageByPath, getClusterHubPaths } from "@/features/landing/clusterHubPages";
import {
  getIntentLandingPageByPath,
  getIntentLandingPaths,
} from "@/features/landing/intentLandingPages";
import { buildClusterHubPrerenderBody } from "./clusterHubPrerenderHtml";
import { buildFaqPrerenderBody } from "./faqPrerenderHtml";
import { buildIntentLandingPrerenderBody } from "./intentLandingPrerenderHtml";
import { getPublicSeoPageByPath } from "./publicSeoPages";
import { buildHomePrerenderBody, buildLegalPrerenderBody } from "./publicSeoPrerenderHtml";
import { SEO_BASE_URL } from "./seoConstants";
import { applySeoToHtml, canonicalUrl, injectPrerenderBody, seoPageToHeadInput } from "./seoHtml";

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
    expect((html.match(/"@type":"FAQPage"/g) ?? []).length).toBe(1);
  });
});

describe("intent landing SEO registry", () => {
  it("registers all intent landing pages in the SEO registry", () => {
    for (const path of getIntentLandingPaths()) {
      expect(getPublicSeoPageByPath(path)).toBeDefined();
    }
  });

  it("includes BreadcrumbList and FAQPage structured data for intent pages", () => {
    const page = getPublicSeoPageByPath("/students/ai-flashcards");
    expect(page).toBeDefined();
    expect(Array.isArray(page!.structuredData)).toBe(true);

    const structuredData = page!.structuredData as Record<string, unknown>[];
    expect(structuredData.some((item) => item["@type"] === "BreadcrumbList")).toBe(true);
    expect(structuredData.some((item) => item["@type"] === "FAQPage")).toBe(true);
  });

  it("registers all cluster hub pages in the SEO registry", () => {
    for (const path of getClusterHubPaths()) {
      expect(getPublicSeoPageByPath(path)).toBeDefined();
    }
  });
});

describe("injectPrerenderBody", () => {
  it("injects homepage h1 for crawlers", () => {
    const bodyHtml = buildHomePrerenderBody();
    const html = injectPrerenderBody(MINIMAL_HTML, bodyHtml);

    expect(html).toContain("<h1>Learn Anything</h1>");
    expect(html).toContain('data-seo-prerender="true"');
  });

  it("injects legal page h1 for crawlers", () => {
    const bodyHtml = buildLegalPrerenderBody("Privacy Policy", "/privacy");
    const html = injectPrerenderBody(MINIMAL_HTML, bodyHtml);

    expect(html).toContain("<h1>Privacy Policy</h1>");
  });

  it("injects static article HTML inside #root", () => {
    const intentPage = getIntentLandingPageByPath("/students/ai-flashcards");
    expect(intentPage).toBeDefined();

    const bodyHtml = buildIntentLandingPrerenderBody(intentPage!);
    const html = injectPrerenderBody(MINIMAL_HTML, bodyHtml);

    expect(html).toContain('data-seo-prerender="true"');
    expect(html).toContain(`<h1>${intentPage!.h1}</h1>`);
    expect(html).toContain(intentPage!.faqs[0]!.answer);
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain('href="/students"');
    expect(html).toContain("Related features");
    expect(html).toContain('href="/students/ai-quizzes"');
    expect(html).not.toMatch(/<div id="root"><\/div>/);
  });

  it("escapes HTML in intent page copy", () => {
    const intentPage = getIntentLandingPageByPath("/students/ai-flashcards");
    expect(intentPage).toBeDefined();

    const bodyHtml = buildIntentLandingPrerenderBody(intentPage!);
    expect(bodyHtml).not.toContain("<script");
  });

  it("registers /faq in the SEO registry with FAQ structured data", () => {
    const page = getPublicSeoPageByPath("/faq");
    expect(page).toBeDefined();
    expect(page!.title).toContain("FAQ");

    const html = applySeoToHtml(MINIMAL_HTML, SEO_BASE_URL, seoPageToHeadInput(page!));
    expect(html).toContain('type="application/ld+json"');
    expect(html).toContain('"@type":"FAQPage"');
  });

  it("injects FAQ page content for crawlers", () => {
    const bodyHtml = buildFaqPrerenderBody();
    const html = injectPrerenderBody(MINIMAL_HTML, bodyHtml);

    expect(html).toContain("<h1>Frequently asked questions</h1>");
    expect(html).toContain("Getting started");
    expect(html).toContain('data-seo-prerender="true"');
  });

  it("injects cluster hub page with child tool links for crawlers", () => {
    const hubPage = getClusterHubPageByPath("/students");
    expect(hubPage).toBeDefined();

    const bodyHtml = buildClusterHubPrerenderBody(hubPage!);
    const html = injectPrerenderBody(MINIMAL_HTML, bodyHtml);

    expect(html).toContain(`<h1>${hubPage!.h1}</h1>`);
    expect(html).toContain('href="/students/ai-flashcards"');
    expect(html).toContain(hubPage!.faqs[0]!.answer);
  });
});
