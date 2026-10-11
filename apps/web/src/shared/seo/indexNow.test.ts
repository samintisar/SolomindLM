import { describe, expect, it, vi } from "vitest";
import {
  fetchSitemapState,
  filterIndexableUrls,
  getIndexNowHost,
  getIndexNowKeyLocation,
  isValidIndexNowKey,
  submitIndexNow,
} from "./indexNow";
import {
  changedSitemapUrls,
  collectChangedCanonicalUrls,
  diffIndexNowUrls,
  parseSitemapState,
} from "./indexNowState";
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
});

describe("fetchSitemapState", () => {
  const deploymentUrl = "https://solomindlm-abc123-samintisars-projects.vercel.app";
  const sitemapUrl = `${deploymentUrl}/sitemap.xml`;

  it("parses the deployment's sitemap with the given headers", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(
          `<urlset><url><loc>${SEO_BASE_URL}/</loc><lastmod>2026-10-10</lastmod></url></urlset>`,
          { status: 200 }
        )
      );

    const state = await fetchSitemapState(deploymentUrl, {
      fetchImpl,
      headers: { "x-vercel-protection-bypass": "secret" },
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      sitemapUrl,
      expect.objectContaining({ headers: { "x-vercel-protection-bypass": "secret" } })
    );
    expect(state).toEqual({ urls: { [`${SEO_BASE_URL}/`]: { lastmod: "2026-10-10" } } });
  });

  it("returns null when the sitemap responds with an error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("nope", { status: 503 }));
    expect(await fetchSitemapState(deploymentUrl, { fetchImpl })).toBeNull();
  });

  it("returns null when a 200 response is not a sitemap", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("<html><body>Maintenance</body></html>", { status: 200 }));
    expect(await fetchSitemapState(deploymentUrl, { fetchImpl })).toBeNull();
  });

  it("returns null when the request throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    expect(await fetchSitemapState(deploymentUrl, { fetchImpl })).toBeNull();
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

  it("treats a page that gains a lastmod as updated", () => {
    const current = [{ url: `${SEO_BASE_URL}/faq`, lastmod: "2026-10-11" }];
    const previous = { urls: { [`${SEO_BASE_URL}/faq`]: { lastmod: "" } } };

    expect(diffIndexNowUrls(current, previous).updated).toEqual([`${SEO_BASE_URL}/faq`]);
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

describe("parseSitemapState validation", () => {
  it("returns null for an HTML page", () => {
    expect(parseSitemapState("<!doctype html><html><body>Not found</body></html>")).toBeNull();
  });

  it("returns null for a truncated sitemap", () => {
    expect(parseSitemapState(`<urlset><url><loc>${SEO_BASE_URL}/</loc>`)).toBeNull();
  });

  it("returns null when other content surrounds the <urlset> root", () => {
    expect(parseSitemapState("<urlset></urlset><html>error</html>")).toBeNull();
    expect(parseSitemapState("<html><urlset></urlset></html>")).toBeNull();
  });

  it("keeps a valid sitemap with no URLs as an empty state", () => {
    expect(parseSitemapState('<?xml version="1.0"?><urlset></urlset>')).toEqual({ urls: {} });
  });

  it("accepts comments before and after the <urlset> root", () => {
    expect(
      parseSitemapState(
        '<?xml version="1.0"?>\n<!-- generator -->\n<urlset></urlset>\n<!-- end -->'
      )
    ).toEqual({ urls: {} });
  });

  it("returns null for an unterminated comment or XML declaration", () => {
    expect(parseSitemapState("<!-- open <urlset></urlset>")).toBeNull();
    expect(parseSitemapState('<?xml version="1.0" <urlset></urlset>')).toBeNull();
  });

  it("returns null when the root is not exactly <urlset>", () => {
    expect(parseSitemapState("<urlsetx></urlset>")).toBeNull();
  });

  it("returns null for a <url> block that is never closed", () => {
    expect(
      parseSitemapState(
        `<urlset><url><loc>${SEO_BASE_URL}/a</loc><url><loc>${SEO_BASE_URL}/b</loc></url></urlset>`
      )
    ).toBeNull();
  });

  it("rejects many unclosed <url> tags in linear time", () => {
    const xml = `<urlset>${"<url>".repeat(20_000)}</urlset>`;
    const start = performance.now();
    expect(parseSitemapState(xml)).toBeNull();
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe("changedSitemapUrls", () => {
  const sitemap = (urls: Record<string, string>) => ({
    urls: Object.fromEntries(
      Object.entries(urls).map(([path, lastmod]) => [`${SEO_BASE_URL}${path}`, { lastmod }])
    ),
  });

  it("returns nothing when the two deployments' sitemaps match", () => {
    const urls = { "/": "", "/privacy": "2026-06-06" };
    expect(changedSitemapUrls(sitemap(urls), sitemap(urls))).toEqual([]);
  });

  it("returns added, removed, and re-dated URLs", () => {
    const previous = sitemap({ "/privacy": "2026-06-06", "/terms": "2026-06-06", "/old": "" });
    const current = sitemap({ "/privacy": "2026-10-11", "/terms": "2026-06-06", "/tools": "" });

    expect(changedSitemapUrls(previous, current)).toEqual([
      `${SEO_BASE_URL}/tools`,
      `${SEO_BASE_URL}/privacy`,
      `${SEO_BASE_URL}/old`,
    ]);
  });

  it("returns a page that gains a lastmod but not one that stays undated", () => {
    const previous = sitemap({ "/": "", "/faq": "" });
    const current = sitemap({ "/": "", "/faq": "2026-10-11" });

    expect(changedSitemapUrls(previous, current)).toEqual([`${SEO_BASE_URL}/faq`]);
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
