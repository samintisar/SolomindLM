import { describe, expect, it, vi } from "vitest";
import {
  fetchPublishedSitemapState,
  filterIndexableUrls,
  getIndexNowHost,
  getIndexNowKeyLocation,
  getPublicSeoCanonicalUrlEntries,
  isValidIndexNowKey,
  submitIndexNow,
} from "./indexNow";
import { dedupeIndexNowUrls, drainIndexNowQueue, mergeIndexNowQueue } from "./indexNowQueue";
import {
  collectChangedCanonicalUrls,
  diffIndexNowUrls,
  parseSitemapState,
  selectChangedIndexNowUrls,
} from "./indexNowState";
import { getIndexablePublicSeoPages } from "./publicSeoPages";
import { SEO_BASE_URL } from "./seoConstants";
import { canonicalUrl } from "./seoHtml";

describe("indexNow helpers", () => {
  it("validates key format", () => {
    expect(isValidIndexNowKey("short")).toBe(false);
    expect(isValidIndexNowKey("valid-key-12345678")).toBe(true);
    expect(isValidIndexNowKey("invalid_key")).toBe(false);
  });

  it("derives host and key location from SEO base URL", () => {
    expect(getIndexNowHost()).toBe("www.solomindlm.com");
    expect(getIndexNowKeyLocation("abc12345")).toBe("https://www.solomindlm.com/abc12345.txt");
  });

  it("filters URLs to the canonical host over https", () => {
    const privacyUrl = canonicalUrl(SEO_BASE_URL, "/privacy");
    const filtered = filterIndexableUrls(
      [privacyUrl, "http://www.solomindlm.com/terms", "https://evil.example/phish", privacyUrl],
      "www.solomindlm.com"
    );
    expect(filtered).toEqual([privacyUrl]);
  });

  it("builds canonical URL entries from the public SEO registry", () => {
    const entries = getPublicSeoCanonicalUrlEntries();
    expect(entries.some((entry) => entry.url === `${SEO_BASE_URL}/`)).toBe(true);
    expect(entries.every((entry) => entry.url.startsWith(`${SEO_BASE_URL}/`))).toBe(true);
  });

  it("keeps only the registry's own lastmod, never a build date", () => {
    const pages = getIndexablePublicSeoPages();
    const entries = getPublicSeoCanonicalUrlEntries();
    expect(entries.map((entry) => entry.lastmod)).toEqual(pages.map((page) => page.lastmod));
  });
});

describe("fetchPublishedSitemapState", () => {
  const sitemapUrl = `${SEO_BASE_URL}/sitemap.xml`;

  it("parses the live sitemap into the published state", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(
          `<urlset><url><loc>${SEO_BASE_URL}/</loc><lastmod>2026-10-10</lastmod></url></urlset>`,
          { status: 200 }
        )
      );

    const state = await fetchPublishedSitemapState({ fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(sitemapUrl, expect.anything());
    expect(state).toEqual({ urls: { [`${SEO_BASE_URL}/`]: { lastmod: "2026-10-10" } } });
  });

  it("returns null when the sitemap responds with an error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("nope", { status: 503 }));
    expect(await fetchPublishedSitemapState({ fetchImpl })).toBeNull();
  });

  it("returns null when the request throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    expect(await fetchPublishedSitemapState({ fetchImpl })).toBeNull();
  });
});

describe("indexNow state diff", () => {
  it("detects added, updated, and removed URLs", () => {
    const current = [
      { url: `${SEO_BASE_URL}/`, lastmod: "2026-06-08" },
      { url: `${SEO_BASE_URL}/privacy`, lastmod: "2026-06-07" },
      { url: `${SEO_BASE_URL}/faq`, lastmod: "2026-06-08" },
    ];
    const previous = {
      urls: {
        [`${SEO_BASE_URL}/`]: { lastmod: "2026-06-08" },
        [`${SEO_BASE_URL}/privacy`]: { lastmod: "2026-06-06" },
        [`${SEO_BASE_URL}/terms`]: { lastmod: "2026-06-06" },
      },
    };

    const diff = diffIndexNowUrls(current, previous);
    expect(diff.added).toEqual([`${SEO_BASE_URL}/faq`]);
    expect(diff.updated).toEqual([`${SEO_BASE_URL}/privacy`]);
    expect(diff.removed).toEqual([`${SEO_BASE_URL}/terms`]);
    expect(collectChangedCanonicalUrls(diff)).toEqual([
      `${SEO_BASE_URL}/faq`,
      `${SEO_BASE_URL}/privacy`,
      `${SEO_BASE_URL}/terms`,
    ]);
  });

  it("never treats an undated page that is already published as updated", () => {
    const current = [{ url: `${SEO_BASE_URL}/`, lastmod: undefined }];
    const previous = { urls: { [`${SEO_BASE_URL}/`]: { lastmod: "2026-10-10" } } };

    expect(diffIndexNowUrls(current, previous).updated).toEqual([]);
  });

  it("still adds an undated page that is not published yet", () => {
    const current = [{ url: `${SEO_BASE_URL}/tools`, lastmod: undefined }];

    expect(diffIndexNowUrls(current, { urls: {} }).added).toEqual([`${SEO_BASE_URL}/tools`]);
  });
});

describe("parseSitemapState", () => {
  it("maps each <loc> to its <lastmod>", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SEO_BASE_URL}/</loc>
    <lastmod>2026-10-10</lastmod>
    <changefreq>weekly</changefreq>
  </url>

  <url>
    <loc>${SEO_BASE_URL}/privacy</loc>
    <lastmod>2026-06-06</lastmod>
  </url>
</urlset>`;

    expect(parseSitemapState(xml)).toEqual({
      urls: {
        [`${SEO_BASE_URL}/`]: { lastmod: "2026-10-10" },
        [`${SEO_BASE_URL}/privacy`]: { lastmod: "2026-06-06" },
      },
    });
  });
});

describe("selectChangedIndexNowUrls", () => {
  it("submits nothing when the published sitemap is unknown", () => {
    const current = [{ url: `${SEO_BASE_URL}/privacy`, lastmod: "2026-06-06" }];
    expect(selectChangedIndexNowUrls(current, null)).toEqual([]);
  });

  it("submits nothing when every page matches the published sitemap", () => {
    const current = getPublicSeoCanonicalUrlEntries();
    const published = {
      urls: Object.fromEntries(
        current.map((entry) => [entry.url, { lastmod: entry.lastmod ?? "2026-10-10" }])
      ),
    };

    expect(selectChangedIndexNowUrls(current, published)).toEqual([]);
  });

  it("submits exactly the page whose lastmod changed", () => {
    const current = [
      { url: `${SEO_BASE_URL}/privacy`, lastmod: "2026-10-11" },
      { url: `${SEO_BASE_URL}/terms`, lastmod: "2026-06-06" },
    ];
    const published = {
      urls: {
        [`${SEO_BASE_URL}/privacy`]: { lastmod: "2026-06-06" },
        [`${SEO_BASE_URL}/terms`]: { lastmod: "2026-06-06" },
      },
    };

    expect(selectChangedIndexNowUrls(current, published)).toEqual([`${SEO_BASE_URL}/privacy`]);
  });
});

describe("indexNow queue", () => {
  it("deduplicates and drains queued URLs", () => {
    const merged = mergeIndexNowQueue({ urls: ["/a", "/b"] }, ["/b", "/c"]);
    expect(merged.urls).toEqual(["/a", "/b", "/c"]);
    expect(dedupeIndexNowUrls(["/a", "/a", "/b"])).toEqual(["/a", "/b"]);

    const drained = drainIndexNowQueue(merged);
    expect(drained.urls).toEqual(["/a", "/b", "/c"]);
    expect(drained.queue).toEqual({ urls: [] });
  });
});

describe("submitIndexNow", () => {
  it("posts the IndexNow payload for valid URLs", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 200,
      statusText: "OK",
    });
    const privacyUrl = canonicalUrl(SEO_BASE_URL, "/privacy");

    const result = await submitIndexNow([privacyUrl], {
      key: "test-key-123456",
      fetchImpl,
    });

    expect(result).toEqual({ status: 200, statusText: "OK", urlCount: 1 });
    expect(fetchImpl).toHaveBeenCalledWith("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: "www.solomindlm.com",
        key: "test-key-123456",
        keyLocation: "https://www.solomindlm.com/test-key-123456.txt",
        urlList: [privacyUrl],
      }),
    });
  });

  it("skips submission when no valid URLs remain", async () => {
    const fetchImpl = vi.fn();
    const result = await submitIndexNow(["https://other.example/page"], {
      key: "test-key-123456",
      fetchImpl,
    });
    expect(result.urlCount).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
