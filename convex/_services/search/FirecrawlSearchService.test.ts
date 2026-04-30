import { describe, it, expect } from "vitest";
import {
  mapFirecrawlResult,
  filterAndSortSources,
  normalizeQuery,
} from "./FirecrawlSearchService";
import type { FirecrawlWebResult } from "./FirecrawlSearchService";

describe("FirecrawlSearchService - Helpers", () => {
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

  describe("mapFirecrawlResult", () => {
    it("maps complete result", () => {
      const result: FirecrawlWebResult = {
        title: "Test Article",
        url: "https://example.com/article",
        snippet: "Snippet text",
        score: 0.85,
        publishedDate: "2024-01-15",
        domain: "example.com",
        rawContent: "# Content",
      };

      const mapped = mapFirecrawlResult(result);

      expect(mapped.title).toBe("Test Article");
      expect(mapped.url).toBe("https://example.com/article");
      expect(mapped.snippet).toBe("Snippet text");
      expect(mapped.score).toBe(0.85);
      expect(mapped.publishedDate).toBe("2024-01-15");
      expect(mapped.domain).toBe("example.com");
      expect(mapped.rawContent).toBe("# Content");
    });

    it("uses defaults for missing fields", () => {
      const result: FirecrawlWebResult = {};

      const mapped = mapFirecrawlResult(result);

      expect(mapped.title).toBe("Untitled");
      expect(mapped.url).toBe("");
      expect(mapped.snippet).toBe("");
      expect(mapped.score).toBe(0);
      expect(mapped.domain).toBeUndefined();
      expect(mapped.rawContent).toBeUndefined();
    });

    it("extracts domain from URL when not provided", () => {
      const result: FirecrawlWebResult = {
        url: "https://subdomain.example.com/path",
      };

      const mapped = mapFirecrawlResult(result);
      expect(mapped.domain).toBe("subdomain.example.com");
    });

    it("handles invalid URLs gracefully", () => {
      const result: FirecrawlWebResult = {
        url: "not-a-valid-url",
      };

      const mapped = mapFirecrawlResult(result);
      expect(mapped.domain).toBeUndefined();
    });

    it("preserves provided domain over extracted", () => {
      const result: FirecrawlWebResult = {
        url: "https://example.com",
        domain: "custom.com",
      };

      const mapped = mapFirecrawlResult(result);
      expect(mapped.domain).toBe("custom.com");
    });
  });

  describe("filterAndSortSources", () => {
    it("filters out low-scoring sources", () => {
      const sources = [
        { title: "High", url: "", snippet: "", score: 0.9 },
        { title: "Low", url: "", snippet: "", score: 0.3 },
        { title: "Medium", url: "", snippet: "", score: 0.6 },
      ];

      const result = filterAndSortSources(sources as any, 0.5);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.title)).toEqual(["High", "Medium"]);
    });

    it("sorts by score descending", () => {
      const sources = [
        { title: "B", url: "", snippet: "", score: 0.7 },
        { title: "A", url: "", snippet: "", score: 0.9 },
        { title: "C", url: "", snippet: "", score: 0.5 },
      ];

      const result = filterAndSortSources(sources as any, 0);
      expect(result.map((r) => r.title)).toEqual(["A", "B", "C"]);
    });

    it("returns empty array when all filtered out", () => {
      const sources = [
        { title: "Low", url: "", snippet: "", score: 0.2 },
      ];

      const result = filterAndSortSources(sources as any, 0.5);
      expect(result).toEqual([]);
    });

    it("returns filtered and sorted results", () => {
      const sources = [
        { title: "B", url: "", snippet: "", score: 0.7 },
        { title: "A", url: "", snippet: "", score: 0.5 },
      ];

      const result = filterAndSortSources(sources as any, 0.3);
      expect(result.map((r) => r.title)).toEqual(["B", "A"]);
    });
  });
});
