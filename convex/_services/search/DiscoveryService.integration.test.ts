import { describe, expect, it } from "vitest";
import { env } from "../../_lib/env";
import { discoverAcademicPapersInternalHandler } from "./AcademicSearchService";
import { discoverHandler, discoverSourcesHandler, type RunActionFn } from "./DiscoveryService";
import { discoverSourcesInternalHandler } from "./TavilySearchService";

/**
 * Integration tests that call the real Tavily and Academic APIs.
 *
 * These are excluded from the default test run because they depend on
 * external service availability and rate limits.
 *
 * Run explicitly with:
 *   bun run test:integration
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

// Create a real runAction that calls the actual handlers
const createRealRunAction = (): RunActionFn => {
  return async (_action, args) => {
    // Route to Tavily if topic is present (web/news/finance)
    if (args.topic !== undefined) {
      return discoverSourcesInternalHandler(args);
    }
    // Route to Academic if academic-specific filters are present
    if (
      args.publicationYearFrom !== undefined ||
      args.publicationYearTo !== undefined ||
      args.minCitations !== undefined ||
      args.openAccessOnly !== undefined ||
      args.sortBy !== undefined
    ) {
      return discoverAcademicPapersInternalHandler(args);
    }
    // Default: try Tavily for basic web search
    return discoverSourcesInternalHandler(args);
  };
};

describe("DiscoveryService - REAL Integration Tests", () => {
  // Skip entirely if no API key is configured
  if (!env.TAVILY_API_KEY) {
    it.skip("skipped — TAVILY_API_KEY not configured", () => {});
    return;
  }

  describe("discoverHandler - REAL APIs", () => {
    it("discovers real web sources only", async () => {
      const result = await discoverHandler(
        {
          query: "machine learning",
          sourceTypes: ["web"],
          maxResults: 5,
        },
        createRealRunAction()
      );

      // If Tavily is rate limited or out of credits, result will be empty
      // Skip assertions in that case
      if (result.sources.length === 0) {
        console.log(
          "Skipping test: Tavily API returned no results (likely rate limited or out of credits)"
        );
        return;
      }

      expect(result.sources.length).toBeGreaterThan(0);
      expect(result.sources.length).toBeLessThanOrEqual(5);
      expect(result.totalCount).toBe(result.sources.length);
      expect(result.sources[0].sourceType).toBe("web");
      expect(result.sources[0].metadata.relevanceLabel).toBeDefined();
      expect(result.sourceTypeCounts.web).toBeGreaterThan(0);
    }, 30000);

    it("discovers real academic sources", async () => {
      const result = await discoverHandler(
        {
          query: "deep learning",
          sourceTypes: ["academic"],
          maxResults: 5,
        },
        createRealRunAction()
      );

      // Soft-failure: academic APIs may be unavailable or rate-limited
      if (result.sources.length === 0) {
        console.log(
          "Skipping assertions: academic APIs returned no results (rate-limited or unreachable)"
        );
        return;
      }
      expect(result.sources.length).toBeGreaterThan(0);
      expect(result.sources.length).toBeLessThanOrEqual(5);
      expect(result.sources[0].sourceType).toBe("academic");
      expect(result.sourceTypeCounts.academic).toBeGreaterThan(0);
    }, 30000);

    it("discovers multiple source types in parallel", async () => {
      const result = await discoverHandler(
        {
          query: "neural networks",
          sourceTypes: ["web", "academic"],
          maxResults: 8,
        },
        createRealRunAction()
      );

      // If all APIs fail, result may be empty
      if (result.sources.length === 0) {
        console.log("Skipping test: APIs returned no results (likely rate limited)");
        return;
      }

      expect(result.sources.length).toBeGreaterThan(0);
      expect(result.sources.length).toBeLessThanOrEqual(8);
      expect(result.sourceTypeCounts).toHaveProperty("web");
      expect(result.sourceTypeCounts).toHaveProperty("academic");

      const hasWeb = result.sources.some((s) => s.sourceType === "web");
      const hasAcademic = result.sources.some((s) => s.sourceType === "academic");
      expect(hasWeb || hasAcademic).toBe(true);
    }, 30000);

    it("sorts real results by date", async () => {
      const result = await discoverHandler(
        {
          query: "artificial intelligence",
          sourceTypes: ["web"],
          maxResults: 10,
          sortBy: "date",
        },
        createRealRunAction()
      );

      if (result.sources.length === 0) {
        console.log("Skipping test: APIs returned no results (likely rate limited)");
        return;
      }

      if (result.sources.length > 1) {
        // Check that results with dates are sorted descending
        const datedResults = result.sources.filter((s) => s.publishedDate);
        for (let i = 1; i < datedResults.length; i++) {
          const prev = new Date(datedResults[i - 1].publishedDate!).getTime();
          const curr = new Date(datedResults[i].publishedDate!).getTime();
          expect(prev).toBeGreaterThanOrEqual(curr);
        }
      }
    }, 30000);

    it("limits total results to maxResults", async () => {
      const result = await discoverHandler(
        {
          query: "technology",
          sourceTypes: ["web"],
          maxResults: 3,
        },
        createRealRunAction()
      );

      if (result.sources.length === 0) {
        console.log("Skipping test: APIs returned no results (likely rate limited)");
        return;
      }

      expect(result.totalCount).toBeLessThanOrEqual(3);
      expect(result.sources.length).toBeLessThanOrEqual(3);
    }, 30000);

    it("applies real academic filters", async () => {
      const result = await discoverHandler(
        {
          query: "machine learning",
          sourceTypes: ["academic"],
          maxResults: 10,
          academicFilters: {
            publicationYearFrom: 2020,
            publicationYearTo: 2024,
            minCitations: 5,
            openAccessOnly: true,
          },
        },
        createRealRunAction()
      );

      for (const source of result.sources) {
        if (source.metadata?.publicationYear) {
          expect(source.metadata.publicationYear).toBeGreaterThanOrEqual(2020);
          expect(source.metadata.publicationYear).toBeLessThanOrEqual(2024);
        }
        if (source.metadata?.citationCount !== undefined) {
          expect(source.metadata.citationCount).toBeGreaterThanOrEqual(5);
        }
        if (source.metadata?.openAccess !== undefined) {
          expect(source.metadata.openAccess).toBe(true);
        }
      }
    }, 30000);
  });

  describe("discoverSourcesHandler - REAL Tavily API", () => {
    it("calls Tavily with default parameters", async () => {
      try {
        const result = await discoverSourcesHandler({ query: "test query" }, createRealRunAction());

        expect(Array.isArray(result)).toBe(true);
        if (result.length > 0) {
          expect(result[0].title).toBeTruthy();
          expect(result[0].url).toBeTruthy();
        }
      } catch (error) {
        if (isRateLimitOrCreditError(error)) {
          console.log("Skipping test: Tavily API rate limited or out of credits");
          return;
        }
        throw error;
      }
    }, 30000);

    it("passes custom maxResults", async () => {
      try {
        const result = await discoverSourcesHandler(
          { query: "test", maxResults: 3 },
          createRealRunAction()
        );

        expect(result.length).toBeLessThanOrEqual(3);
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
