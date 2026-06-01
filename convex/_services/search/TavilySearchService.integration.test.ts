import { describe, expect, it } from "vitest";
import { env } from "../../_lib/env";
import { discoverSourcesInternalHandler, searchInternalHandler } from "./TavilySearchService";

/**
 * Integration tests that call the real Tavily API.
 *
 * These are excluded from the default test run because they depend on
 * external service availability and rate limits.
 *
 * Run explicitly with:
 *   bun run test:integration
 *
 * Or directly:
 *   vitest run --config vitest.convex.config.ts convex/_services/search/TavilySearchService.integration.test.ts
 */

function isRateLimitOrCreditError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes("Insufficient credits") ||
    msg.includes("rate limit") ||
    msg.includes("429") ||
    msg.includes("exceeds the pay-as-you-go limit")
  );
}

describe("TavilySearchService - REAL Integration Tests", () => {
  // Skip entirely if no API key is configured
  if (!env.TAVILY_API_KEY) {
    it.skip("skipped — TAVILY_API_KEY not configured", () => {});
    return;
  }

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
});
