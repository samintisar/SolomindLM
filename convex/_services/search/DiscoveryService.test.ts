import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth
vi.mock("../../auth", () => ({
  getAuthUserId: vi.fn(),
}));

// Mock logging
vi.mock("../../_lib/logging/serviceLogger", () => ({
  createServiceLogger: () => ({
    operationStart: vi.fn(),
    operationComplete: vi.fn(),
    operationError: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    performance: vi.fn(),
    apiCall: vi.fn(),
    apiError: vi.fn(),
    apiSuccess: vi.fn(),
    cacheHit: vi.fn(),
    cacheMiss: vi.fn(),
  }),
}));

import { discover, discoverSources } from "./DiscoveryService";
import { getAuthUserId } from "../../auth";

describe("DiscoveryService", () => {
  let runActionMock: ReturnType<typeof vi.fn>;
  let mockCtx: any;

  beforeEach(() => {
    vi.clearAllMocks();

    runActionMock = vi.fn();
    mockCtx = {
      runAction: runActionMock,
    };

    // Default authenticated user
    (getAuthUserId as ReturnType<typeof vi.fn>).mockResolvedValue("user123");
  });

  describe("discover", () => {
    it("throws error when user is not authenticated", async () => {
      (getAuthUserId as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        discover.handler(mockCtx, {
          query: "test",
          sourceTypes: ["web"],
          maxResults: 10,
          filters: {},
        })
      ).rejects.toThrow("Unauthenticated");
    });

    it("discovers web sources only", async () => {
      runActionMock.mockImplementation((_action: any, args: any) => {
        if (args.topic === "general" || !args.topic) {
          return Promise.resolve([
            {
              title: "Web Result 1",
              url: "https://example.com/1",
              snippet: "Snippet 1",
              score: 0.9,
              domain: "example.com",
            },
            {
              title: "Web Result 2",
              url: "https://example.com/2",
              snippet: "Snippet 2",
              score: 0.8,
              domain: "example.com",
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await discover.handler(mockCtx, {
        query: "machine learning",
        sourceTypes: ["web"],
        maxResults: 10,
        filters: {},
      });

      expect(result.sources).toHaveLength(2);
      expect(result.totalCount).toBe(2);
      expect(result.sourceTypeCounts).toHaveProperty("web");
      expect(result.sources[0].sourceType).toBe("web");
      expect(result.sources[0].metadata.relevanceLabel).toBe("high");
    });

    it("discovers news sources", async () => {
      runActionMock.mockImplementation((_action: any, args: any) => {
        if (args.topic === "news") {
          return Promise.resolve([
            {
              title: "Breaking News",
              url: "https://news.example.com/story",
              snippet: "News snippet.",
              score: 0.85,
              publishedDate: "2024-01-15",
              domain: "news.example.com",
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await discover.handler(mockCtx, {
        query: "breaking story",
        sourceTypes: ["news"],
        maxResults: 10,
        filters: {},
      });

      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].sourceType).toBe("news");
      expect(result.sources[0].publishedDate).toBe("2024-01-15");
    });

    it("discovers academic sources", async () => {
      runActionMock.mockImplementation((_action: any, args: any) => {
        if (args.publicationYearFrom !== undefined || args.sortBy !== undefined) {
          // Academic search
          return Promise.resolve([
            {
              title: "Academic Paper",
              url: "https://arxiv.org/abs/1234",
              snippet: "Abstract here.",
              score: 0.92,
              publishedDate: "2023-01-01",
              metadata: {
                authors: ["Author One"],
                citationCount: 100,
                openAccess: true,
                hasFullText: true,
                pdfUrl: "https://arxiv.org/pdf/1234.pdf",
                doi: "10.1234/test",
                sourceApi: "arxiv",
              },
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await discover.handler(mockCtx, {
        query: "deep learning",
        sourceTypes: ["academic"],
        maxResults: 10,
        filters: {},
      });

      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].sourceType).toBe("academic");
      expect(result.sources[0].metadata.authors).toEqual(["Author One"]);
      expect(result.sources[0].metadata.citationCount).toBe(100);
      expect(result.sources[0].metadata.openAccess).toBe(true);
    });

    it("discovers multiple source types in parallel", async () => {
      runActionMock.mockImplementation((_action: any, args: any) => {
        if (args.topic === "general") {
          return Promise.resolve([
            { title: "Web 1", url: "https://web1.com", snippet: "Web.", score: 0.9, domain: "web1.com" },
          ]);
        }
        if (args.publicationYearFrom !== undefined || args.minCitations !== undefined) {
          return Promise.resolve([
            { title: "Academic 1", url: "https://arxiv.org/abs/1", snippet: "Academic.", score: 0.95, metadata: { sourceApi: "arxiv" } },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await discover.handler(mockCtx, {
        query: "neural networks",
        sourceTypes: ["web", "academic"],
        maxResults: 10,
        filters: {},
      });

      expect(result.sources).toHaveLength(2);
      expect(result.sourceTypeCounts).toHaveProperty("web");
      expect(result.sourceTypeCounts).toHaveProperty("academic");
    });

    it("distributes maxResults evenly across source types", async () => {
      runActionMock.mockImplementation((_action: any, args: any) => {
        if (args.topic === "general") {
          return Promise.resolve([
            { title: "Web 1", url: "https://w1.com", snippet: "S1", score: 0.9, domain: "w1.com" },
            { title: "Web 2", url: "https://w2.com", snippet: "S2", score: 0.8, domain: "w2.com" },
            { title: "Web 3", url: "https://w3.com", snippet: "S3", score: 0.7, domain: "w3.com" },
          ]);
        }
        if (args.topic === "news") {
          return Promise.resolve([
            { title: "News 1", url: "https://n1.com", snippet: "S1", score: 0.85, domain: "n1.com" },
            { title: "News 2", url: "https://n2.com", snippet: "S2", score: 0.75, domain: "n2.com" },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await discover.handler(mockCtx, {
        query: "test",
        sourceTypes: ["web", "news"],
        maxResults: 4,
        filters: {},
      });

      // Should get at most 4 results total
      expect(result.totalCount).toBeLessThanOrEqual(4);
      expect(result.sources.length).toBeLessThanOrEqual(4);
    });

    it("sorts results by date", async () => {
      runActionMock.mockResolvedValue([
        {
          title: "Old Article",
          url: "https://example.com/old",
          snippet: "Old.",
          score: 0.9,
          publishedDate: "2020-01-01",
          domain: "example.com",
        },
        {
          title: "New Article",
          url: "https://example.com/new",
          snippet: "New.",
          score: 0.7,
          publishedDate: "2024-01-01",
          domain: "example.com",
        },
      ]);

      const result = await discover.handler(mockCtx, {
        query: "test",
        sourceTypes: ["web"],
        maxResults: 10,
        filters: {},
        sortBy: "date",
      });

      expect(result.sources[0].title).toBe("New Article");
      expect(result.sources[1].title).toBe("Old Article");
    });

    it("sorts results by citations for academic sources", async () => {
      runActionMock.mockImplementation((_action: any, args: any) => {
        if (args.sortBy === "citations") {
          return Promise.resolve([
            {
              title: "Low Citations",
              url: "https://arxiv.org/abs/low",
              snippet: "Low.",
              score: 0.9,
              metadata: { citationCount: 10, sourceApi: "arxiv" },
            },
            {
              title: "High Citations",
              url: "https://arxiv.org/abs/high",
              snippet: "High.",
              score: 0.7,
              metadata: { citationCount: 1000, sourceApi: "arxiv" },
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await discover.handler(mockCtx, {
        query: "test",
        sourceTypes: ["academic"],
        maxResults: 10,
        filters: {},
        sortBy: "citations",
      });

      expect(result.sources[0].title).toBe("High Citations");
      expect(result.sources[1].title).toBe("Low Citations");
    });

    it("handles failures gracefully and returns results from successful sources", async () => {
      runActionMock.mockImplementation((_action: any, args: any) => {
        if (args.topic === "general") {
          return Promise.resolve([
            { title: "Web Result", url: "https://example.com", snippet: "Web.", score: 0.8, domain: "example.com" },
          ]);
        }
        if (args.topic === "news") {
          return Promise.reject(new Error("News API failed"));
        }
        return Promise.resolve([]);
      });

      const result = await discover.handler(mockCtx, {
        query: "test",
        sourceTypes: ["web", "news"],
        maxResults: 10,
        filters: {},
      });

      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].title).toBe("Web Result");
    });

    it("applies timeRange to web searches", async () => {
      runActionMock.mockImplementation((_action: any, args: any) => {
        expect(args.timeRange).toBe("week");
        return Promise.resolve([]);
      });

      await discover.handler(mockCtx, {
        query: "recent news",
        sourceTypes: ["web"],
        maxResults: 10,
        filters: {},
        timeRange: "week",
      });
    });

    it("applies academic filters to academic search", async () => {
      runActionMock.mockImplementation((_action: any, args: any) => {
        if (args.publicationYearFrom !== undefined) {
          expect(args.publicationYearFrom).toBe(2020);
          expect(args.publicationYearTo).toBe(2024);
          expect(args.minCitations).toBe(50);
          expect(args.openAccessOnly).toBe(true);
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });

      await discover.handler(mockCtx, {
        query: "machine learning",
        sourceTypes: ["academic"],
        maxResults: 10,
        filters: {},
        academicFilters: {
          publicationYearFrom: 2020,
          publicationYearTo: 2024,
          minCitations: 50,
          openAccessOnly: true,
        },
      });
    });

    it("normalizes web results correctly", async () => {
      runActionMock.mockResolvedValue([
        {
          title: "Test",
          url: "https://example.com",
          snippet: "Snippet",
          score: 0.95,
          domain: "example.com",
        },
      ]);

      const result = await discover.handler(mockCtx, {
        query: "test",
        sourceTypes: ["web"],
        maxResults: 10,
        filters: {},
      });

      const source = result.sources[0];
      expect(source.id).toContain("web-web-");
      expect(source.title).toBe("Test");
      expect(source.url).toBe("https://example.com");
      expect(source.snippet).toBe("Snippet");
      expect(source.score).toBe(0.95);
      expect(source.sourceType).toBe("web");
      expect(source.metadata.domain).toBe("example.com");
      expect(source.metadata.relevanceLabel).toBe("high");
    });

    it("normalizes academic results correctly", async () => {
      runActionMock.mockImplementation((_action: any, args: any) => {
        if (args.sortBy || args.publicationYearFrom !== undefined) {
          return Promise.resolve([
            {
              title: "Academic Paper",
              url: "https://arxiv.org/abs/1234",
              snippet: "Abstract.",
              score: 0.88,
              publishedDate: "2023",
              metadata: {
                authors: ["Author One", "Author Two"],
                citationCount: 42,
                pdfUrl: "https://arxiv.org/pdf/1234.pdf",
                doi: "10.1234/test",
                sourceApi: "arxiv",
              },
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await discover.handler(mockCtx, {
        query: "test",
        sourceTypes: ["academic"],
        maxResults: 10,
        filters: {},
      });

      const source = result.sources[0];
      expect(source.id).toContain("academic-");
      expect(source.title).toBe("Academic Paper");
      expect(source.sourceType).toBe("academic");
      expect(source.metadata.authors).toEqual(["Author One", "Author Two"]);
      expect(source.metadata.citationCount).toBe(42);
      expect(source.metadata.openAccess).toBe(true);
      expect(source.metadata.hasFullText).toBe(true);
      expect(source.metadata.publicationYear).toBe(2023);
      expect(source.metadata.doi).toBe("10.1234/test");
      expect(source.metadata.pdfUrl).toBe("https://arxiv.org/pdf/1234.pdf");
    });

    it("handles empty results from all sources", async () => {
      runActionMock.mockResolvedValue([]);

      const result = await discover.handler(mockCtx, {
        query: "xyznonexistent12345",
        sourceTypes: ["web", "academic", "news"],
        maxResults: 10,
        filters: {},
      });

      expect(result.sources).toEqual([]);
      expect(result.totalCount).toBe(0);
      expect(Object.keys(result.sourceTypeCounts).length).toBeGreaterThanOrEqual(0);
    });

    it("limits total results to maxResults", async () => {
      runActionMock.mockImplementation((_action: any, _args: any) => {
        return Promise.resolve(
          Array.from({ length: 20 }, (_, i) => ({
            title: `Result ${i}`,
            url: `https://example.com/${i}`,
            snippet: `Snippet ${i}`,
            score: 1 - i * 0.01,
            domain: "example.com",
          }))
        );
      });

      const result = await discover.handler(mockCtx, {
        query: "test",
        sourceTypes: ["web"],
        maxResults: 5,
        filters: {},
      });

      expect(result.totalCount).toBeLessThanOrEqual(5);
      expect(result.sources.length).toBeLessThanOrEqual(5);
    });

    it("sorts by relevance by default", async () => {
      runActionMock.mockResolvedValue([
        { title: "Medium", url: "https://m.com", snippet: "M", score: 0.7, domain: "m.com" },
        { title: "High", url: "https://h.com", snippet: "H", score: 0.9, domain: "h.com" },
        { title: "Low", url: "https://l.com", snippet: "L", score: 0.5, domain: "l.com" },
      ]);

      const result = await discover.handler(mockCtx, {
        query: "test",
        sourceTypes: ["web"],
        maxResults: 10,
        filters: {},
      });

      expect(result.sources[0].title).toBe("High");
      expect(result.sources[1].title).toBe("Medium");
      expect(result.sources[2].title).toBe("Low");
    });
  });

  describe("discoverSources", () => {
    it("throws error when user is not authenticated", async () => {
      (getAuthUserId as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        discoverSources.handler(mockCtx, {
          query: "test",
        })
      ).rejects.toThrow("Unauthenticated");
    });

    it("calls Firecrawl with default parameters", async () => {
      runActionMock.mockResolvedValue([
        { title: "Result", url: "https://example.com", snippet: "Snippet", score: 0.8 },
      ]);

      const result = await discoverSources.handler(mockCtx, {
        query: "test query",
      });

      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].title).toBe("Result");

      // Should use default maxResults of 10
      expect(runActionMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          query: "test query",
          maxResults: 10,
        })
      );
    });

    it("passes custom maxResults", async () => {
      runActionMock.mockResolvedValue([]);

      await discoverSources.handler(mockCtx, {
        query: "test",
        maxResults: 25,
      });

      expect(runActionMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          maxResults: 25,
        })
      );
    });

    it("passes scoreThreshold when provided", async () => {
      runActionMock.mockResolvedValue([]);

      await discoverSources.handler(mockCtx, {
        query: "test",
        scoreThreshold: 0.8,
      });

      expect(runActionMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          scoreThreshold: 0.8,
        })
      );
    });
  });
});
