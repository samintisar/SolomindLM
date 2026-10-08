import { describe, expect, it } from "vitest";
import { CLUSTER_HUB_PAGES } from "./clusterHubPages";
import {
  getIntentBreadcrumbItems,
  getIntentLandingPageByPath,
  getRelatedIntentPages,
  INTENT_LANDING_PAGES,
} from "./intentLandingPages";

describe("getIntentBreadcrumbItems", () => {
  it("returns Home → cluster hub → page label for student intents", () => {
    const page = getIntentLandingPageByPath("/students/ai-flashcards");
    expect(page).toBeDefined();

    expect(getIntentBreadcrumbItems(page!)).toEqual([
      { name: "Home", path: "/" },
      { name: "Students", path: "/students" },
      { name: "Flashcards", path: "/students/ai-flashcards" },
    ]);
  });

  it("returns Home → Research hub for research intents", () => {
    const page = getIntentLandingPageByPath("/research/ai-literature-review");
    expect(page).toBeDefined();

    expect(getIntentBreadcrumbItems(page!)).toEqual([
      { name: "Home", path: "/" },
      { name: "Research", path: "/research" },
      { name: "Literature Review", path: "/research/ai-literature-review" },
    ]);
  });
});

describe("getRelatedIntentPages", () => {
  it("returns up to three same-cluster siblings from FEATURE_INTENT_PATHS order", () => {
    const page = getIntentLandingPageByPath("/students/ai-flashcards");
    expect(page).toBeDefined();

    const related = getRelatedIntentPages(page!);
    expect(related).toHaveLength(3);
    expect(related.map((item) => item.path)).toEqual([
      "/students/ai-reports",
      "/students/ai-quizzes",
      "/students/ai-mind-maps",
    ]);
    expect(related.every((item) => item.cluster === "students")).toBe(true);
    expect(related.some((item) => item.path === page!.path)).toBe(false);
  });

  it("excludes the current page when it is first or last in cluster order", () => {
    const page = getIntentLandingPageByPath("/students/ai-audio-overview");
    expect(page).toBeDefined();

    const related = getRelatedIntentPages(page!);
    expect(related).toHaveLength(3);
    expect(related.map((item) => item.path)).not.toContain(page!.path);
    expect(related.every((item) => item.cluster === "students")).toBe(true);
  });
});

describe("content page fields", () => {
  it("gives every tool page a short card blurb", () => {
    for (const page of INTENT_LANDING_PAGES) {
      expect(page.cardBlurb.length, page.path).toBeGreaterThan(0);
      expect(page.cardBlurb.length, page.path).toBeLessThanOrEqual(60);
    }
  });

  it("only accents a phrase that is in the h1", () => {
    for (const page of [...INTENT_LANDING_PAGES, ...CLUSTER_HUB_PAGES]) {
      if (page.h1Accent) expect(page.h1, page.path).toContain(page.h1Accent);
    }
  });
});
