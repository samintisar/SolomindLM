import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock env before importing modules that use it
vi.mock("../../_lib/env", () => ({
  env: {
    FIRECRAWL_API_KEY: "test-firecrawl-api-key",
  },
}));

// Mock logging to keep test output clean
vi.mock("../../_lib/logging/serviceLogger", () => ({
  createServiceLogger: () => ({
    operationStart: vi.fn(),
    operationComplete: vi.fn(),
    operationError: vi.fn(),
    apiCall: vi.fn(),
    apiError: vi.fn(),
    apiSuccess: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    performance: vi.fn(),
    cacheHit: vi.fn(),
    cacheMiss: vi.fn(),
  }),
}));

// Mock the cache module
vi.mock("../cache/cachedAgent", () => ({
  createCachedAction: vi.fn(() => ({
    fetch: vi.fn(async (_ctx: any, args: any) => {
      // Pass through to searchInternal
      const { searchInternal } = await import("./FirecrawlSearchService");
      return searchInternal.handler(null as any, args);
    }),
  })),
}));

vi.mock("../cache/cache", () => ({
  CACHE_TTL: { search: 3600000 },
  withJitter: (ttl: number) => ttl,
}));

// Mock FirecrawlApp
const mockSearch = vi.fn();
vi.mock("@mendable/firecrawl-js", () => ({
  default: vi.fn(() => ({
    search: mockSearch,
  })),
}));

import { searchInternal, discoverSourcesInternal } from "./FirecrawlSearchService";

describe("FirecrawlSearchService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("searchInternal", () => {
    it("throws error when FIRECRAWL_API_KEY is not configured", async () => {
      // Temporarily override the mock
      const { env } = await import("../../_lib/env");
      const originalKey = env.FIRECRAWL_API_KEY;
      env.FIRECRAWL_API_KEY = "";

      await expect(
        searchInternal.handler(null as any, {
          query: "test",
          maxResults: 10,
          scoreThreshold: 0.5,
        })
      ).rejects.toThrow("FIRECRAWL_API_KEY is not configured");

      env.FIRECRAWL_API_KEY = originalKey;
    });

    it("searches web sources and returns formatted results", async () => {
      mockSearch.mockResolvedValue({
        data: {
          web: [
            {
              title: "Test Article",
              url: "https://example.com/article",
              snippet: "This is a test article snippet.",
              score: 0.95,
              publishedDate: "2024-01-15",
              domain: "example.com",
              rawContent: "# Test Article\n\nFull content here.",
            },
            {
              title: "Another Article",
              url: "https://test.com/another",
              snippet: "Another snippet.",
              score: 0.82,
            },
          ],
        },
      });

      const result = await searchInternal.handler(null as any, {
        query: "test query",
        maxResults: 10,
        scoreThreshold: 0.5,
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        title: "Test Article",
        url: "https://example.com/article",
        snippet: "This is a test article snippet.",
        score: 0.95,
        publishedDate: "2024-01-15",
        domain: "example.com",
        rawContent: "# Test Article\n\nFull content here.",
      });
      expect(result[1].title).toBe("Another Article");
      expect(result[1].domain).toBe("test.com"); // Extracted from URL
    });

    it("filters results below score threshold", async () => {
      mockSearch.mockResolvedValue({
        data: {
          web: [
            { title: "High Score", url: "https://example.com/high", snippet: "High.", score: 0.9 },
            { title: "Low Score", url: "https://example.com/low", snippet: "Low.", score: 0.3 },
            { title: "Medium Score", url: "https://example.com/medium", snippet: "Medium.", score: 0.6 },
          ],
        },
      });

      const result = await searchInternal.handler(null as any, {
        query: "test",
        maxResults: 10,
        scoreThreshold: 0.5,
      });

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.title)).toEqual(["High Score", "Medium Score"]);
    });

    it("sorts results by score descending", async () => {
      mockSearch.mockResolvedValue({
        data: {
          web: [
            { title: "B", url: "https://example.com/b", snippet: "B.", score: 0.7 },
            { title: "A", url: "https://example.com/a", snippet: "A.", score: 0.9 },
            { title: "C", url: "https://example.com/c", snippet: "C.", score: 0.5 },
          ],
        },
      });

      const result = await searchInternal.handler(null as any, {
        query: "test",
        maxResults: 10,
        scoreThreshold: 0.1,
      });

      expect(result.map((r) => r.title)).toEqual(["A", "B", "C"]);
    });

    it("handles missing fields with defaults", async () => {
      mockSearch.mockResolvedValue({
        data: {
          web: [
            {
              // Missing title, snippet, score, url
            },
          ],
        },
      });

      const result = await searchInternal.handler(null as any, {
        query: "test",
        maxResults: 10,
        scoreThreshold: 0,
      });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Untitled");
      expect(result[0].url).toBe("");
      expect(result[0].snippet).toBe("");
      expect(result[0].score).toBe(0);
    });

    it("extracts domain from URL when not provided", async () => {
      mockSearch.mockResolvedValue({
        data: {
          web: [
            {
              title: "No Domain",
              url: "https://subdomain.example.com/path",
              snippet: "Test.",
              score: 0.8,
            },
          ],
        },
      });

      const result = await searchInternal.handler(null as any, {
        query: "test",
        maxResults: 10,
        scoreThreshold: 0.5,
      });

      expect(result[0].domain).toBe("subdomain.example.com");
    });

    it("handles invalid URLs gracefully", async () => {
      mockSearch.mockResolvedValue({
        data: {
          web: [
            {
              title: "Bad URL",
              url: "not-a-valid-url",
              snippet: "Test.",
              score: 0.8,
            },
          ],
        },
      });

      const result = await searchInternal.handler(null as any, {
        query: "test",
        maxResults: 10,
        scoreThreshold: 0.5,
      });

      expect(result[0].domain).toBeUndefined();
    });

    it("uses news topic filter when specified", async () => {
      mockSearch.mockResolvedValue({
        data: {
          web: [
            {
              title: "News Article",
              url: "https://news.example.com/story",
              snippet: "Breaking news.",
              score: 0.85,
            },
          ],
        },
      });

      await searchInternal.handler(null as any, {
        query: "breaking news",
        maxResults: 10,
        scoreThreshold: 0.5,
        topic: "news",
      });

      expect(mockSearch).toHaveBeenCalledWith(
        "breaking news",
        expect.objectContaining({
          sources: ["news"],
        })
      );
    });

    it("uses timeRange filter when specified", async () => {
      mockSearch.mockResolvedValue({
        data: {
          web: [],
        },
      });

      await searchInternal.handler(null as any, {
        query: "recent events",
        maxResults: 10,
        scoreThreshold: 0.5,
        timeRange: "week",
      });

      expect(mockSearch).toHaveBeenCalledWith(
        "recent events",
        expect.objectContaining({
          tbs: "qdr:w",
        })
      );
    });

    it("returns empty array when no web results", async () => {
      mockSearch.mockResolvedValue({
        data: {},
      });

      const result = await searchInternal.handler(null as any, {
        query: "test",
        maxResults: 10,
        scoreThreshold: 0.5,
      });

      expect(result).toEqual([]);
    });

    it("returns empty array when data is null", async () => {
      mockSearch.mockResolvedValue(null);

      const result = await searchInternal.handler(null as any, {
        query: "test",
        maxResults: 10,
        scoreThreshold: 0.5,
      });

      expect(result).toEqual([]);
    });

    it("throws ExternalServiceError on API failure", async () => {
      mockSearch.mockRejectedValue(new Error("Rate limit exceeded"));

      await expect(
        searchInternal.handler(null as any, {
          query: "test",
          maxResults: 10,
          scoreThreshold: 0.5,
        })
      ).rejects.toThrow();
    });

    it("normalizes query in discoverSourcesInternal", async () => {
      mockSearch.mockResolvedValue({
        data: {
          web: [],
        },
      });

      await discoverSourcesInternal.handler(null as any, {
        query: "  Mixed   CASE  query  ",
        maxResults: 10,
      });

      expect(mockSearch).toHaveBeenCalledWith(
        "mixed case query",
        expect.any(Object)
      );
    });

    it("uses default values for optional parameters in discoverSourcesInternal", async () => {
      mockSearch.mockResolvedValue({
        data: {
          web: [],
        },
      });

      await discoverSourcesInternal.handler(null as any, {
        query: "test",
      });

      expect(mockSearch).toHaveBeenCalledWith(
        "test",
        expect.objectContaining({
          limit: 10,
        })
      );
    });
  });
});
