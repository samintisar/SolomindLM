import { describe, expect, it } from "vitest";
import {
  COMPARE_HUB_PATH,
  getComparisonPages,
  getSeoContentBreadcrumbItems,
  getSeoContentPageByPath,
  getSeoContentPaths,
  SEO_CONTENT_PAGES,
} from "./seoContentPages";

const COMPETITOR_SLUGS = [
  "notebooklm",
  "elicit",
  "consensus",
  "chatpdf",
  "scispace",
  "humata",
  "storm",
  "quizlet",
  "perplexity",
];

describe("SEO_CONTENT_PAGES", () => {
  it("registers the compare hub, one compare page per competitor, and the guides", () => {
    expect(getSeoContentPaths()).toEqual([
      COMPARE_HUB_PATH,
      ...COMPETITOR_SLUGS.map((slug) => `/compare/solomindlm-vs-${slug}`),
      "/guides/how-to-study-from-pdfs-with-ai",
      "/guides/how-to-do-an-ai-literature-review",
    ]);
  });

  it("gives every page a unique title, description, and h1", () => {
    for (const field of ["title", "description", "h1"] as const) {
      const values = SEO_CONTENT_PAGES.map((page) => page[field]);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it("keeps titles and descriptions within search-snippet length", () => {
    for (const page of SEO_CONTENT_PAGES) {
      expect(page.title.length, page.path).toBeLessThanOrEqual(65);
      expect(page.description.length, page.path).toBeLessThanOrEqual(165);
    }
  });

  it("never repeats an FAQ question across pages", () => {
    const questions = SEO_CONTENT_PAGES.flatMap((page) => page.faqs.map((faq) => faq.question));
    expect(new Set(questions).size).toBe(questions.length);
  });

  it("links only to registered SEO content or existing hub and intent paths", () => {
    for (const page of SEO_CONTENT_PAGES) {
      for (const link of page.relatedLinks) {
        expect(link.path, `${page.path} → ${link.path}`).toMatch(
          /^\/(compare|guides|students|research)(\/|$)/
        );
        expect(link.path, `${page.path} links to itself`).not.toBe(page.path);
      }
    }
  });
});

describe("getComparisonPages", () => {
  it("returns every competitor page and excludes the hub", () => {
    const pages = getComparisonPages();
    expect(pages.map((page) => page.path)).toEqual(
      COMPETITOR_SLUGS.map((slug) => `/compare/solomindlm-vs-${slug}`)
    );
    expect(pages.every((page) => page.pageType === "compare")).toBe(true);
  });
});

describe("compare page content", () => {
  it.each(getComparisonPages().map((page) => [page.path, page] as const))(
    "%s has a named competitor, table, quick answer, FAQs, and sources",
    (_path, page) => {
      expect(page.competitorName).toBeTruthy();
      expect(page.comparisonTable?.length).toBeGreaterThanOrEqual(6);
      expect(page.quickAnswer?.chooseSolomindlm).toBeTruthy();
      expect(page.quickAnswer?.chooseCompetitor).toBeTruthy();
      expect(page.faqs.length).toBeGreaterThanOrEqual(5);
      expect(page.sources?.length).toBeGreaterThan(0);
      for (const source of page.sources ?? []) {
        expect(source.url).toMatch(/^https:\/\//);
      }
      expect(page.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  );

  it("names each competitor in the page title", () => {
    for (const page of getComparisonPages()) {
      expect(page.title).toContain(page.competitorName);
    }
  });
});

describe("compare hub", () => {
  it("links to every comparison page", () => {
    const hub = getSeoContentPageByPath(COMPARE_HUB_PATH);
    expect(hub?.pageType).toBe("compareHub");
    expect(hub?.relatedLinks.map((link) => link.path)).toEqual(
      getComparisonPages().map((page) => page.path)
    );
  });
});

describe("getSeoContentBreadcrumbItems", () => {
  it("returns Home → Compare hub → page for comparison content", () => {
    const page = getSeoContentPageByPath("/compare/solomindlm-vs-elicit");
    expect(page).toBeDefined();

    expect(getSeoContentBreadcrumbItems(page!)).toEqual([
      { name: "Home", path: "/" },
      { name: "Compare", path: COMPARE_HUB_PATH },
      { name: "SolomindLM vs Elicit", path: "/compare/solomindlm-vs-elicit" },
    ]);
  });

  it("returns Home → Compare for the hub itself", () => {
    const hub = getSeoContentPageByPath(COMPARE_HUB_PATH);
    expect(getSeoContentBreadcrumbItems(hub!)).toEqual([
      { name: "Home", path: "/" },
      { name: "Compare", path: COMPARE_HUB_PATH },
    ]);
  });

  it("returns Home → Guides → page for guide content", () => {
    const page = getSeoContentPageByPath("/guides/how-to-do-an-ai-literature-review");
    expect(page).toBeDefined();

    expect(getSeoContentBreadcrumbItems(page!)).toEqual([
      { name: "Home", path: "/" },
      { name: "Guides", path: "/guides/how-to-study-from-pdfs-with-ai" },
      { name: "AI literature review guide", path: "/guides/how-to-do-an-ai-literature-review" },
    ]);
  });
});

describe("SEO_CONTENT_PAGES h1 accents", () => {
  it("only accents a phrase that is in the h1", () => {
    for (const page of SEO_CONTENT_PAGES) {
      if (page.h1Accent) expect(page.h1, page.path).toContain(page.h1Accent);
    }
  });

  it("accents every page", () => {
    for (const page of SEO_CONTENT_PAGES) {
      expect(page.h1Accent, page.path).toBeTruthy();
    }
  });
});
