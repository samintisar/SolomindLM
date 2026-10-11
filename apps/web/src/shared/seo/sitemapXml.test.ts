import { describe, expect, it } from "vitest";
import { parseSitemapState } from "./indexNowState";
import type { PublicSeoPage } from "./publicSeoPages";
import { SEO_BASE_URL } from "./seoConstants";
import { buildSitemapXml } from "./sitemapXml";

const page = (path: string, lastmod?: string): PublicSeoPage => ({
  path,
  title: "Title",
  description: "Description",
  lastmod,
});

describe("buildSitemapXml", () => {
  it("writes the registry lastmod when a page has one", () => {
    const xml = buildSitemapXml([page("/privacy", "2026-06-06")]);
    expect(xml).toContain(`<loc>${SEO_BASE_URL}/privacy</loc>`);
    expect(xml).toContain("<lastmod>2026-06-06</lastmod>");
  });

  it("omits lastmod for an undated page instead of stamping the build date", () => {
    const xml = buildSitemapXml([page("/faq")]);
    expect(xml).not.toContain("<lastmod>");
  });

  it("round-trips through parseSitemapState", () => {
    const xml = buildSitemapXml([page("/faq"), page("/privacy", "2026-06-06")]);
    expect(parseSitemapState(xml)).toEqual({
      urls: {
        [`${SEO_BASE_URL}/faq`]: { lastmod: "" },
        [`${SEO_BASE_URL}/privacy`]: { lastmod: "2026-06-06" },
      },
    });
  });
});
