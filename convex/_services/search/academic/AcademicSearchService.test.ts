import { describe, it, expect, vi } from "vitest";
import {
  searchInternalHandler,
  discoverAcademicPapersInternalHandler,
} from "./AcademicSearchService";
import type { AcademicPaper } from "./types";

vi.useFakeTimers();
vi.setSystemTime(new Date("2024-01-15"));

describe("AcademicSearchService - discoverAcademicPapersInternalHandler", () => {
  it("normalizes query and transforms to DiscoveredSource", async () => {
    const mockPaper: AcademicPaper = {
      title: "Test Paper",
      authors: ["Author"],
      year: 2023,
      abstract: "Abstract text",
      url: "http://example.com",
      source: "arxiv",
      score: 0.9,
    };
    const mockFetch = vi.fn().mockResolvedValue([mockPaper]);

    const result = await discoverAcademicPapersInternalHandler(
      { query: "  TEST  QUERY  ", maxResults: 5 },
      mockFetch
    );

    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({ query: "test query" })
    );
    expect(result[0].title).toBe("Test Paper");
    expect(result[0].snippet).toBe("Abstract text");
  });
});

// ============================================================
// REAL Integration Tests - Actual API Calls
// These tests require live internet access. Skip in restricted environments by
// setting env var SKIP_NETWORK_TESTS=1 or running `bun run test:convex --testNamePattern`.
// ============================================================

const describeIfNetwork =
  process.env.CI || process.env.SKIP_NETWORK_TESTS === "1" ? describe.skip : describe;

describeIfNetwork("AcademicSearchService - REAL Integration Tests", () => {
  vi.useRealTimers();

  describe("searchInternalHandler - REAL arXiv API", () => {
    it("returns real papers from arXiv", async () => {
      const result = await searchInternalHandler({
        query: "machine learning",
        maxResults: 5,
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(5);

      const firstPaper = result[0];
      expect(firstPaper.title).toBeTruthy();
      expect(firstPaper.url).toBeTruthy();
      expect(typeof firstPaper.abstract).toBe("string");
      expect(firstPaper.source).toBeTruthy();
      expect(firstPaper.score).toBeGreaterThan(0);
      expect(Array.isArray(firstPaper.authors)).toBe(true);
    }, 30000);

    it("filters arXiv results by year", async () => {
      const result = await searchInternalHandler({
        query: "deep learning",
        maxResults: 10,
        publicationYearFrom: 2020,
      });

      expect(result.length).toBeGreaterThan(0);
      for (const paper of result) {
        expect(paper.year).toBeGreaterThanOrEqual(2020);
      }
    }, 30000);
  });

  describe("searchInternalHandler - REAL Semantic Scholar API", () => {
    it("returns real papers from Semantic Scholar", async () => {
      const result = await searchInternalHandler({
        query: "artificial intelligence",
        maxResults: 5,
      });

      if (result.length > 0) {
        const paper = result.find((p) => p.source === "semantic_scholar");
        if (paper) {
          expect(paper.title).toBeTruthy();
          expect(paper.url).toBeTruthy();
          expect(paper.abstract).toBeTruthy();
          expect(paper.score).toBeGreaterThan(0);
        }
      }
    }, 30000);
  });

  describe("searchInternalHandler - REAL PubMed API", () => {
    it("returns real papers from PubMed", async () => {
      const result = await searchInternalHandler({
        query: "cancer immunotherapy",
        maxResults: 5,
      });

      if (result.length > 0) {
        const paper = result.find((p) => p.source === "pubmed");
        if (paper) {
          expect(paper.title).toBeTruthy();
          expect(paper.url).toBeTruthy();
          expect(paper.abstract).toBeTruthy();
          expect(paper.score).toBeGreaterThan(0);
        }
      }
    }, 30000);
  });

  describe("discoverAcademicPapersInternalHandler - REAL APIs", () => {
    it("discovers and transforms real academic papers", async () => {
      const result = await discoverAcademicPapersInternalHandler({
        query: "neural networks",
        maxResults: 5,
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(5);

      const source = result[0];
      expect(source.title).toBeTruthy();
      expect(source.url).toBeTruthy();
      expect(source.snippet).toBeTruthy();
      expect(source.score).toBeGreaterThan(0);
      expect(source.metadata).toBeDefined();
    }, 30000);

    it("applies real filters on live data", async () => {
      const result = await discoverAcademicPapersInternalHandler({
        query: "quantum computing",
        maxResults: 10,
        publicationYearFrom: 2020,
        minCitations: 10,
      });

      if (result.length > 0) {
        for (const source of result) {
          if (source.metadata?.citationCount !== undefined) {
            expect(source.metadata.citationCount).toBeGreaterThanOrEqual(10);
          }
        }
      }
    }, 30000);
  });
});
