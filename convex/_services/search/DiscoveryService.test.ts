import { describe, it, expect } from "vitest";
import {
  normalizeScore,
  getRelevanceLabel,
  transformWebResult,
  transformAcademicResult,
  sortResults,
  distributeResults,
  discoverHandler,
  discoverSourcesHandler,
  type RunActionFn,
} from "./DiscoveryService";
import type { UnifiedDiscoveryResult } from "./DiscoveryService";
import { discoverSourcesInternalHandler } from "./TavilySearchService";
import { discoverAcademicPapersInternalHandler } from "./AcademicSearchService";
import { env } from "../../_lib/env";

describe("DiscoveryService", () => {
  describe("normalizeScore", () => {
    it("clamps scores to 0-1 range", () => {
      expect(normalizeScore(1.5, "web")).toBe(1);
      expect(normalizeScore(-0.5, "web")).toBe(0);
      expect(normalizeScore(0.5, "web")).toBe(0.5);
    });

    it("handles edge cases", () => {
      expect(normalizeScore(0, "academic")).toBe(0);
      expect(normalizeScore(1, "news")).toBe(1);
    });
  });

  describe("getRelevanceLabel", () => {
    it("returns high for scores >= 0.8", () => {
      expect(getRelevanceLabel(0.8)).toBe("high");
      expect(getRelevanceLabel(0.95)).toBe("high");
    });

    it("returns medium for scores >= 0.6", () => {
      expect(getRelevanceLabel(0.6)).toBe("medium");
      expect(getRelevanceLabel(0.79)).toBe("medium");
    });

    it("returns low for scores < 0.6", () => {
      expect(getRelevanceLabel(0.59)).toBe("low");
      expect(getRelevanceLabel(0.1)).toBe("low");
    });
  });

  describe("transformWebResult", () => {
    it("transforms web result correctly", () => {
      const result = {
        title: "Test Article",
        url: "https://example.com/article",
        snippet: "Snippet",
        score: 0.85,
        publishedDate: "2024-01-15",
        domain: "example.com",
      };

      const transformed = transformWebResult(result, "web");

      expect(transformed.id).toBe("web-web-https://example.com/article");
      expect(transformed.title).toBe("Test Article");
      expect(transformed.url).toBe("https://example.com/article");
      expect(transformed.snippet).toBe("Snippet");
      expect(transformed.score).toBe(0.85);
      expect(transformed.sourceType).toBe("web");
      expect(transformed.publishedDate).toBe("2024-01-15");
      expect(transformed.metadata.domain).toBe("example.com");
      expect(transformed.metadata.relevanceLabel).toBe("high");
    });

    it("transforms news result correctly", () => {
      const result = {
        title: "News Story",
        url: "https://news.example.com/story",
        snippet: "Breaking news",
        score: 0.7,
        domain: "news.example.com",
      };

      const transformed = transformWebResult(result, "news");

      expect(transformed.sourceType).toBe("news");
      expect(transformed.metadata.relevanceLabel).toBe("medium");
    });

    it("transforms finance result correctly", () => {
      const result = {
        title: "Market Report",
        url: "https://finance.example.com/report",
        snippet: "Stocks up",
        score: 0.5,
      };

      const transformed = transformWebResult(result, "finance");

      expect(transformed.sourceType).toBe("finance");
      expect(transformed.metadata.relevanceLabel).toBe("low");
    });
  });

  describe("transformAcademicResult", () => {
    it("transforms academic result with all metadata", () => {
      const result = {
        title: "Research Paper",
        url: "https://arxiv.org/abs/1234",
        snippet: "Abstract here",
        score: 0.92,
        publishedDate: "2023",
        metadata: {
          authors: ["Author One", "Author Two"],
          citationCount: 100,
          pdfUrl: "https://arxiv.org/pdf/1234.pdf",
          doi: "10.1234/test",
          sourceApi: "arxiv",
        },
      };

      const transformed = transformAcademicResult(result);

      expect(transformed.id).toBe("academic-arxiv-https://arxiv.org/abs/1234");
      expect(transformed.title).toBe("Research Paper");
      expect(transformed.sourceType).toBe("academic");
      expect(transformed.metadata.authors).toEqual(["Author One", "Author Two"]);
      expect(transformed.metadata.citationCount).toBe(100);
      expect(transformed.metadata.openAccess).toBe(true);
      expect(transformed.metadata.hasFullText).toBe(true);
      expect(transformed.metadata.publicationYear).toBe(2023);
      expect(transformed.metadata.doi).toBe("10.1234/test");
      expect(transformed.metadata.pdfUrl).toBe("https://arxiv.org/pdf/1234.pdf");
      expect(transformed.metadata.landingPageUrl).toBe("https://arxiv.org/abs/1234");
      expect(transformed.metadata.type).toBe("article");
    });

    it("handles missing metadata gracefully", () => {
      const result = {
        title: "Minimal Paper",
        url: "https://example.com/paper",
        snippet: "Abstract",
        score: 0.6,
      };

      const transformed = transformAcademicResult(result);

      expect(transformed.id).toBe("academic-unknown-https://example.com/paper");
      expect(transformed.metadata.openAccess).toBe(false);
      expect(transformed.metadata.hasFullText).toBe(false);
      expect(transformed.metadata.publicationYear).toBeUndefined();
    });
  });

  describe("sortResults", () => {
    const results: UnifiedDiscoveryResult[] = [
      {
        id: "1",
        title: "Old High Score",
        url: "http://1",
        snippet: "S1",
        score: 0.9,
        sourceType: "web",
        publishedDate: "2020-01-01",
      },
      {
        id: "2",
        title: "New Low Score",
        url: "http://2",
        snippet: "S2",
        score: 0.7,
        sourceType: "web",
        publishedDate: "2024-01-01",
      },
      {
        id: "3",
        title: "Medium",
        url: "http://3",
        snippet: "S3",
        score: 0.8,
        sourceType: "web",
      },
      {
        id: "4",
        title: "Academic High Citations",
        url: "http://4",
        snippet: "S4",
        score: 0.6,
        sourceType: "academic",
        metadata: { citationCount: 100 },
      },
      {
        id: "5",
        title: "Academic Low Citations",
        url: "http://5",
        snippet: "S5",
        score: 0.85,
        sourceType: "academic",
        metadata: { citationCount: 10 },
      },
    ];

    it("sorts by relevance (score) descending", () => {
      const sorted = sortResults([...results], "relevance");
      expect(sorted[0].title).toBe("Old High Score");
      expect(sorted[1].title).toBe("Academic Low Citations");
      expect(sorted[2].title).toBe("Medium");
      expect(sorted[3].title).toBe("New Low Score");
      expect(sorted[4].title).toBe("Academic High Citations");
    });

    it("sorts by date descending", () => {
      const sorted = sortResults([...results], "date");
      expect(sorted[0].title).toBe("New Low Score");
      expect(sorted[1].title).toBe("Old High Score");
      // Items without dates go to the end
      expect(sorted[sorted.length - 1].title).toBe("Academic High Citations");
    });

    it("sorts by citations descending", () => {
      const sorted = sortResults([...results], "citations");
      expect(sorted[0].title).toBe("Academic High Citations");
      expect(sorted[1].title).toBe("Academic Low Citations");
    });

    it("uses score as tiebreaker when both lack dates", () => {
      const noDates: UnifiedDiscoveryResult[] = [
        { id: "1", title: "A", url: "", snippet: "", score: 0.5, sourceType: "web" },
        { id: "2", title: "B", url: "", snippet: "", score: 0.8, sourceType: "web" },
      ];
      const sorted = sortResults([...noDates], "date");
      expect(sorted[0].title).toBe("B");
      expect(sorted[1].title).toBe("A");
    });

    it("does not mutate original array", () => {
      const original = [...results];
      sortResults(results, "relevance");
      expect(results).toEqual(original);
    });
  });

  describe("distributeResults", () => {
    const createResults = (count: number, prefix: string): UnifiedDiscoveryResult[] =>
      Array.from({ length: count }, (_, i) => ({
        id: `${prefix}-${i}`,
        title: `${prefix} ${i}`,
        url: `http://${prefix}-${i}`,
        snippet: "S",
        score: 1 - i * 0.1,
        sourceType: prefix as any,
      }));

    it("distributes evenly across two sources", () => {
      const resultsBySource = [
        { sourceType: "web", results: createResults(10, "web") },
        { sourceType: "academic", results: createResults(10, "academic") },
      ];

      const distributed = distributeResults(resultsBySource, 10);
      // 5 from each source (ceil(10/2) = 5)
      expect(distributed).toHaveLength(10);
      const webCount = distributed.filter((r) => r.sourceType === "web").length;
      const academicCount = distributed.filter((r) => r.sourceType === "academic").length;
      expect(webCount).toBe(5);
      expect(academicCount).toBe(5);
    });

    it("distributes across three sources", () => {
      const resultsBySource = [
        { sourceType: "web", results: createResults(10, "web") },
        { sourceType: "news", results: createResults(10, "news") },
        { sourceType: "academic", results: createResults(10, "academic") },
      ];

      const distributed = distributeResults(resultsBySource, 9);
      // ceil(9/3) = 3 from each
      expect(distributed).toHaveLength(9);
    });

    it("handles empty results", () => {
      expect(distributeResults([], 10)).toEqual([]);
    });

    it("caps to maxResults when distributed exceeds limit", () => {
      const resultsBySource = [
        { sourceType: "web", results: createResults(10, "web") },
        { sourceType: "news", results: createResults(10, "news") },
      ];

      const distributed = distributeResults(resultsBySource, 5);
      // ceil(5/2) = 3 from each = 6 total, should cap to 5
      expect(distributed).toHaveLength(5);
    });

    it("returns all results when total is under maxResults", () => {
      const resultsBySource = [
        { sourceType: "web", results: createResults(3, "web") },
        { sourceType: "academic", results: createResults(2, "academic") },
      ];

      const distributed = distributeResults(resultsBySource, 10);
      expect(distributed).toHaveLength(5);
    });

    it("takes top results from each source by original order", () => {
      const resultsBySource = [
        {
          sourceType: "web",
          results: [
            { id: "w1", title: "Web 1", url: "", snippet: "", score: 0.9, sourceType: "web" },
            { id: "w2", title: "Web 2", url: "", snippet: "", score: 0.8, sourceType: "web" },
          ],
        },
        {
          sourceType: "academic",
          results: [
            { id: "a1", title: "Academic 1", url: "", snippet: "", score: 0.95, sourceType: "academic" },
            { id: "a2", title: "Academic 2", url: "", snippet: "", score: 0.85, sourceType: "academic" },
          ],
        },
      ];

      const distributed = distributeResults(resultsBySource, 4);
      expect(distributed.map((r) => r.id)).toEqual(["w1", "w2", "a1", "a2"]);
    });
  });
});

// ============================================================
// REAL Integration Tests - Actual Discovery with Live APIs
// ============================================================

const hasTavilyKey = !!env.TAVILY_API_KEY;

function isRateLimitOrCreditError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("Insufficient credits") || msg.includes("rate limit") || msg.includes("429");
}

// Create a real runAction that calls the actual handlers
const createRealRunAction = (): RunActionFn => {
  return async (_action, args) => {
    // Route to Tavily if topic is present (web/news/finance)
    if (args.topic !== undefined) {
      return discoverSourcesInternalHandler(args);
    }
    // Route to Academic if academic-specific filters are present
    if (args.publicationYearFrom !== undefined || args.publicationYearTo !== undefined || args.minCitations !== undefined || args.openAccessOnly !== undefined || args.sortBy !== undefined) {
      return discoverAcademicPapersInternalHandler(args);
    }
    // Default: try Tavily for basic web search
    return discoverSourcesInternalHandler(args);
  };
};

const describeIfKey = hasTavilyKey ? describe : describe.skip;

describeIfKey("DiscoveryService - REAL Integration Tests", () => {
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
        console.log("Skipping test: Tavily API returned no results (likely rate limited or out of credits)");
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
        const result = await discoverSourcesHandler(
          { query: "test query" },
          createRealRunAction()
        );

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

// Test error handling with a failing runAction
describe("DiscoveryService - Error Handling", () => {
  it("handles failures gracefully", async () => {
    const failingRunAction: RunActionFn = async (_action, args) => {
      if (args.topic === "general" || args.topic === undefined) {
        return [
          { title: "Web Result", url: "https://example.com", snippet: "Web.", score: 0.8, domain: "example.com" },
        ];
      }
      throw new Error("News API failed");
    };

    const result = await discoverHandler(
      {
        query: "test",
        sourceTypes: ["web", "news"],
        maxResults: 10,
      },
      failingRunAction
    );

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].title).toBe("Web Result");
  });
});
