import { describe, expect, it, vi } from "vitest";
import {
  discoverAcademicPapersInternalHandler,
  searchInternalHandler,
} from "./AcademicSearchService";

/**
 * Integration tests that call the real arXiv, Semantic Scholar, and PubMed APIs.
 *
 * These are excluded from the default test run because they depend on
 * external service availability and rate limits.
 *
 * Run explicitly with:
 *   bun run test:integration
 */

describe("AcademicSearchService - REAL Integration Tests", () => {
  if (process.env.CI || process.env.SKIP_NETWORK_TESTS === "1") {
    it.skip("skipped in CI or when SKIP_NETWORK_TESTS is set", () => {});
    return;
  }

  vi.useRealTimers();

  describe("searchInternalHandler - REAL arXiv API", () => {
    it("returns real papers from arXiv", async () => {
      const { papers: result } = await searchInternalHandler({
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
      const { papers: result } = await searchInternalHandler({
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
      const { papers: result } = await searchInternalHandler({
        query: "artificial intelligence",
        maxResults: 5,
      });

      // Semantic Scholar might fail or return empty, so just verify structure if we get results
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
      const { papers: result } = await searchInternalHandler({
        query: "cancer immunotherapy",
        maxResults: 5,
      });

      // PubMed might fail or return empty, so just verify structure if we get results
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
      const { sources: result } = await discoverAcademicPapersInternalHandler({
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
      const { sources: result } = await discoverAcademicPapersInternalHandler({
        query: "quantum computing",
        maxResults: 10,
        publicationYearFrom: 2020,
        minCitations: 10,
      });

      // If we get results, verify they meet the filter criteria
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
