import { describe, it, expect } from "vitest";
import {
  normalizeQuery,
  searchInternalHandler,
  discoverSourcesInternalHandler,
  deepResearchHandler,
} from "./TavilySearchService";
import { env } from "../../_lib/env";

// ============================================================
// Unit Tests (mocked)
// ============================================================

describe("TavilySearchService - Helpers", () => {
  describe("normalizeQuery", () => {
    it("lowercases query", () => {
      expect(normalizeQuery("Machine Learning")).toBe("machine learning");
    });

    it("trims whitespace", () => {
      expect(normalizeQuery("  query  ")).toBe("query");
    });

    it("collapses multiple spaces", () => {
      expect(normalizeQuery("too   many    spaces")).toBe("too many spaces");
    });
  });
});

describe("TavilySearchService - searchInternalHandler", () => {
  it("throws when API key is missing", async () => {
    const originalKey = env.TAVILY_API_KEY;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (env as any).TAVILY_API_KEY = "";

    await expect(
      searchInternalHandler({
        query: "test",
        maxResults: 10,
        scoreThreshold: 0.5,
      })
    ).rejects.toThrow("TAVILY_API_KEY is not configured");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (env as any).TAVILY_API_KEY = originalKey;
  });
});

// ============================================================
// REAL Integration Tests - Actual API Calls
// ============================================================

const hasTavilyKey = !!env.TAVILY_API_KEY;
const describeIfKey = hasTavilyKey ? describe : describe.skip;

function isRateLimitOrCreditError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("Insufficient credits") || msg.includes("rate limit") || msg.includes("429");
}

describeIfKey("TavilySearchService - REAL Integration Tests", () => {
  describe("searchInternalHandler - REAL Tavily API", () => {
    it("searches and returns real web results", async () => {
      try {
        const result = await searchInternalHandler({
          query: "latest technology news",
          maxResults: 5,
          scoreThreshold: 0.1,
        });

        expect(result.length).toBeGreaterThan(0);
        expect(result.length).toBeLessThanOrEqual(5);

        const firstResult = result[0];
        expect(firstResult.title).toBeTruthy();
        expect(firstResult.url).toBeTruthy();
        expect(firstResult.url.startsWith("http")).toBe(true);
        expect(firstResult.snippet).toBeTruthy();
        expect(typeof firstResult.score).toBe("number");
        console.log(
          "Web search results:",
          result.map((r) => ({ title: r.title, score: r.score, url: r.url }))
        );
      } catch (error) {
        if (isRateLimitOrCreditError(error)) {
          console.log("Skipping test: Tavily API rate limited or out of credits");
          return;
        }
        throw error;
      }
    }, 30000);

    it("returns news results with topic filter", async () => {
      try {
        const result = await searchInternalHandler({
          query: "breaking news",
          maxResults: 5,
          scoreThreshold: 0.1,
          topic: "news",
        });

        if (result.length > 0) {
          const firstResult = result[0];
          expect(firstResult.title).toBeTruthy();
          expect(firstResult.url).toBeTruthy();
        }
        console.log(
          "News search results:",
          result.map((r) => ({ title: r.title, score: r.score, url: r.url }))
        );
      } catch (error) {
        if (isRateLimitOrCreditError(error)) {
          console.log("Skipping test: Tavily API rate limited or out of credits");
          return;
        }
        throw error;
      }
    }, 30000);

    it("applies timeRange filter", async () => {
      try {
        const result = await searchInternalHandler({
          query: "technology",
          maxResults: 5,
          scoreThreshold: 0.1,
          timeRange: "week",
        });

        expect(Array.isArray(result)).toBe(true);
        console.log(
          "TimeRange search results:",
          result.map((r) => ({ title: r.title, score: r.score }))
        );
      } catch (error) {
        if (isRateLimitOrCreditError(error)) {
          console.log("Skipping test: Tavily API rate limited or out of credits");
          return;
        }
        throw error;
      }
    }, 30000);

    it("filters results below score threshold", async () => {
      try {
        const result = await searchInternalHandler({
          query: "popular topic",
          maxResults: 10,
          scoreThreshold: 0.8,
        });

        for (const source of result) {
          expect(source.score).toBeGreaterThanOrEqual(0.8);
        }
        console.log(
          "Filtered search results:",
          result.map((r) => ({ title: r.title, score: r.score }))
        );
      } catch (error) {
        if (isRateLimitOrCreditError(error)) {
          console.log("Skipping test: Tavily API rate limited or out of credits");
          return;
        }
        throw error;
      }
    }, 30000);

    it("uses include domains filter", async () => {
      try {
        const result = await searchInternalHandler({
          query: "machine learning",
          maxResults: 5,
          scoreThreshold: 0.1,
          includeDomains: ["arxiv.org"],
        });

        for (const source of result) {
          expect(source.url).toContain("arxiv.org");
        }
        console.log(
          "Include domains results:",
          result.map((r) => ({ title: r.title, url: r.url }))
        );
      } catch (error) {
        if (isRateLimitOrCreditError(error)) {
          console.log("Skipping test: Tavily API rate limited or out of credits");
          return;
        }
        throw error;
      }
    }, 30000);

    it("uses search depth advanced", async () => {
      try {
        const result = await searchInternalHandler({
          query: "quantum computing applications",
          maxResults: 3,
          scoreThreshold: 0.1,
          searchDepth: "advanced",
        });

        expect(Array.isArray(result)).toBe(true);
        console.log(
          "Advanced depth results:",
          result.map((r) => ({ title: r.title, hasRawContent: !!r.rawContent }))
        );
      } catch (error) {
        if (isRateLimitOrCreditError(error)) {
          console.log("Skipping test: Tavily API rate limited or out of credits");
          return;
        }
        throw error;
      }
    }, 30000);
  });

  describe("discoverSourcesInternalHandler - REAL Tavily API", () => {
    it("normalizes query and searches", async () => {
      try {
        const result = await discoverSourcesInternalHandler({
          query: "  Machine   LEARNING  Applications  ",
          maxResults: 5,
        });

        expect(Array.isArray(result)).toBe(true);
        if (result.length > 0) {
          expect(result[0].title).toBeTruthy();
          expect(result[0].url).toBeTruthy();
        }
        console.log(
          "Normalized query results:",
          result.map((r) => ({ title: r.title, url: r.url }))
        );
      } catch (error) {
        if (isRateLimitOrCreditError(error)) {
          console.log("Skipping test: Tavily API rate limited or out of credits");
          return;
        }
        throw error;
      }
    }, 30000);

    it("uses default parameters", async () => {
      try {
        const result = await discoverSourcesInternalHandler({
          query: "open source software",
        });

        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeLessThanOrEqual(10);
        console.log(
          "Default params results:",
          result.map((r) => ({ title: r.title, score: r.score }))
        );
      } catch (error) {
        if (isRateLimitOrCreditError(error)) {
          console.log("Skipping test: Tavily API rate limited or out of credits");
          return;
        }
        throw error;
      }
    }, 30000);
  });

  describe("deepResearchHandler - REAL Tavily API", () => {
    it("starts research and polls until completed", async () => {
      try {
        const result = await deepResearchHandler({
          input: "What are the latest developments in quantum computing in 2025?",
          model: "mini",
        });

        expect(result.status).toBe("completed");
        expect(result.content).toBeTruthy();
        expect(result.content!.length).toBeGreaterThan(100);
        console.log("Deep research completed, content length:", result.content!.length);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (
          isRateLimitOrCreditError(error) ||
          msg.includes("Input task is invalid") ||
          msg.includes("No research task found")
        ) {
          console.log("Skipping test: Tavily deep research not available or rate limited");
          return;
        }
        throw error;
      }
    }, 120000);
  });
});
