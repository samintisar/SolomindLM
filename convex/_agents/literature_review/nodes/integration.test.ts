"use node";

import { describe, it, expect } from "vitest";
import { searchPapersNode } from "./searchPapers";
import { deduplicatePapersNode } from "./deduplicatePapers";
import { rankPapersNode } from "./rankPapers";
import { screenPapersNode } from "./screenPapers";
import { extractDataNode } from "./extractData";
import { generateTableNode } from "./generateTable";
import type { LiteratureReviewStateType } from "../state";
import type { LiteratureReviewNodeDeps, AcademicPaper, ScreenedPaper, RankedPaper } from "../types";

/**
 * Integration tests for literature review nodes working together.
 *
 * These tests verify that the output of one node is compatible with the input
 * expectations of the next node in the pipeline.
 */

function createMockDeps(overrides: Partial<LiteratureReviewNodeDeps> = {}): LiteratureReviewNodeDeps {
  return {
    apiKey: "test-key",
    smartModel: "test-model",
    ...overrides,
  };
}

function createBaseState(overrides: Partial<LiteratureReviewStateType> = {}): LiteratureReviewStateType {
  return {
    query: "test query",
    searchQueries: ["query1", "query2"],
    suggestedColumns: [],
    confirmedColumns: [
      { id: "col1", name: "Column 1", instructions: "Extract this", isVisible: true },
    ],
    papers: [],
    rankedPapers: [],
    screenedPapers: [],
    extractedData: {},
    tableColumns: [],
    citations: [],
    tableId: undefined,
    reportId: undefined,
    progress: { phase: "planning", percentage: 0, message: "" },
    error: undefined,
    sessionId: "session-123",
    notebookId: "notebook-456",
    userId: "user-789",
    ...overrides,
  };
}

describe("Node Integration Tests", () => {
  describe("searchPapers → deduplicatePapers", () => {
    it("search output is valid input for deduplication", async () => {
      const mockPapers: AcademicPaper[] = [
        {
          title: "Paper A",
          authors: ["Author A"],
          year: 2024,
          doi: "10.1234/a",
          abstract: "Abstract A",
          url: "https://example.com/a",
          source: "arxiv",
          score: 0.9,
        },
        {
          title: "Paper B",
          authors: ["Author B"],
          year: 2024,
          doi: "10.1234/b",
          abstract: "Abstract B",
          url: "https://example.com/b",
          source: "semantic_scholar",
          score: 0.8,
        },
      ];

      const searchDeps = createMockDeps({
        searchPapers: async () => mockPapers,
      });

      const searchState = createBaseState();
      const searchResult = await searchPapersNode(searchState, searchDeps);

      // Verify search produced papers
      expect(searchResult.papers).toBeDefined();
      expect(searchResult.papers?.length).toBe(2);

      // Verify papers can be fed into deduplication
      const dedupState = createBaseState({ papers: searchResult.papers || [] });
      const dedupResult = await deduplicatePapersNode(dedupState, searchDeps);

      expect(dedupResult.papers).toBeDefined();
      expect(dedupResult.papers?.length).toBeGreaterThanOrEqual(1);
    });

    it("handles duplicate papers across sources", async () => {
      const duplicatePapers: AcademicPaper[] = [
        {
          title: "Same Paper",
          authors: ["Author"],
          year: 2024,
          doi: "10.1234/same",
          abstract: "Abstract",
          url: "https://example.com/same",
          source: "arxiv",
          score: 0.9,
        },
        {
          title: "Same Paper",
          authors: ["Author"],
          year: 2024,
          doi: "10.1234/same",
          abstract: "Abstract",
          url: "https://example.com/same2",
          source: "semantic_scholar",
          score: 0.8,
        },
      ];

      const deps = createMockDeps();
      const state = createBaseState({ papers: duplicatePapers });
      const result = await deduplicatePapersNode(state, deps);

      expect(result.papers).toHaveLength(1);
    });
  });

  describe("deduplicatePapers → rankPapers", () => {
    it("deduplicated papers can be ranked", async () => {
      const papers: AcademicPaper[] = [
        { title: "Deep Learning for Image Classification", authors: ["A"], doi: "10.1234/1", abstract: "Abs1", url: "", source: "arxiv", score: 0.9 },
        { title: "Random Forests for Medical Diagnosis", authors: ["B"], doi: "10.1234/2", abstract: "Abs2", url: "", source: "arxiv", score: 0.7 },
        { title: "Support Vector Machines for Text Analysis", authors: ["C"], doi: "10.1234/3", abstract: "Abs3", url: "", source: "arxiv", score: 0.8 },
      ];

      const deps = createMockDeps();
      const state = createBaseState({ papers });
      const dedupResult = await deduplicatePapersNode(state, deps);

      const rankState = createBaseState({ papers: dedupResult.papers || [] });
      const rankResult = await rankPapersNode(rankState, deps);

      expect(rankResult.rankedPapers).toBeDefined();
      expect(rankResult.rankedPapers?.length).toBe(3);
      // Should be sorted by score descending
      expect(rankResult.rankedPapers?.[0].score).toBeGreaterThanOrEqual(
        rankResult.rankedPapers?.[1].score || 0
      );
    });
  });

  describe("rankPapers → screenPapers", () => {
    it("ranked papers can be screened", async () => {
      const rankedPapers: RankedPaper[] = [
        {
          title: "Paper 1",
          authors: ["A"],
          doi: "10.1234/1",
          abstract: "Abstract about machine learning in healthcare",
          url: "",
          source: "arxiv",
          score: 0.9,
          rank: 1,
        },
        {
          title: "Paper 2",
          authors: ["B"],
          doi: "10.1234/2",
          abstract: "Abstract about something completely different",
          url: "",
          source: "arxiv",
          score: 0.8,
          rank: 2,
        },
      ];

      const deps = createMockDeps();
      const state = createBaseState({
        rankedPapers,
        query: "machine learning in healthcare",
      });

      const result = await screenPapersNode(state, deps);

      expect(result.screenedPapers).toBeDefined();
      expect(result.screenedPapers?.length).toBe(2);
      // Each paper should have isIncluded flag
      expect(result.screenedPapers?.[0]).toHaveProperty("isIncluded");
    });

    it("screening processes all provided ranked papers", async () => {
      const manyPapers: RankedPaper[] = Array.from({ length: 50 }, (_, i) => ({
        title: `Paper ${i}`,
        authors: ["Author"],
        doi: `10.1234/${i}`,
        abstract: `Abstract ${i}`,
        url: "",
        source: "arxiv",
        score: 0.9 - i * 0.01,
        rank: i + 1,
      }));

      const deps = createMockDeps();
      // In the workflow, rankPapers returns top 30, then screenPapers screens those
      const top30 = manyPapers.slice(0, 30);
      const state = createBaseState({
        rankedPapers: top30,
        query: "test query",
      });

      const result = await screenPapersNode(state, deps);

      // screenPapers processes all papers passed to it (which should be top 30 from workflow)
      expect(result.screenedPapers?.length).toBe(30);
    });
  });

  describe("screenPapers → extractData", () => {
    it("only extracts from included papers", async () => {
      const screenedPapers: ScreenedPaper[] = [
        {
          title: "Included",
          authors: ["A"],
          doi: "10.1234/included",
          abstract: "Good abstract",
          url: "",
          source: "arxiv",
          score: 0.9,
          isIncluded: true,
        },
        {
          title: "Excluded",
          authors: ["B"],
          doi: "10.1234/excluded",
          abstract: "Bad abstract",
          url: "",
          source: "arxiv",
          score: 0.8,
          isIncluded: false,
        },
      ];

      const deps = createMockDeps();
      const state = createBaseState({
        screenedPapers,
        confirmedColumns: [
          { id: "method", name: "Method", instructions: "What method?", isVisible: true },
        ],
        query: "test query",
      });

      const result = await extractDataNode(state, deps);

      // Should only have data for included paper
      expect(Object.keys(result.extractedData || {})).toContain("10.1234/included");
      expect(Object.keys(result.extractedData || {})).not.toContain("10.1234/excluded");
    });
  });

  describe("extractData → generateTable", () => {
    it("extracted data is used to build table", async () => {
      const extractedData: Record<string, Record<string, string>> = {
        "10.1234/1": { method: "RCT", sample: "100" },
        "10.1234/2": { method: "Cohort", sample: "500" },
      };

      const screenedPapers: ScreenedPaper[] = [
        {
          title: "Paper 1",
          authors: ["A"],
          doi: "10.1234/1",
          abstract: "Abstract 1",
          url: "",
          source: "arxiv",
          score: 0.9,
          isIncluded: true,
        },
        {
          title: "Paper 2",
          authors: ["B"],
          doi: "10.1234/2",
          abstract: "Abstract 2",
          url: "",
          source: "arxiv",
          score: 0.8,
          isIncluded: true,
        },
      ];

      const deps = createMockDeps();
      const state = createBaseState({
        extractedData,
        screenedPapers,
        confirmedColumns: [
          { id: "method", name: "Method", instructions: "What method?", isVisible: true },
          { id: "sample", name: "Sample Size", instructions: "How many?", isVisible: true },
        ],
        query: "test query",
      });

      const result = await generateTableNode(state, deps);

      expect(result.tableColumns).toBeDefined();
      expect(result.tableColumns?.length).toBeGreaterThan(0);
      // Should have system columns + custom columns
      expect(result.tableColumns?.some((c) => c.id === "paper_title")).toBe(true);
      expect(result.tableColumns?.some((c) => c.id === "method")).toBe(true);
    });
  });

  describe("Full pipeline with realistic data", () => {
    it("processes 5 papers end-to-end with mocked search and ranking", async () => {
      const papers: AcademicPaper[] = [
        {
          title: "Deep Learning for Medical Image Analysis",
          authors: ["Esteva, A.", "Kuprel, B."],
          year: 2021,
          doi: "10.1038/s41591-021-012345",
          abstract: "We present a deep learning approach for dermatologist-level classification of skin cancer...",
          url: "https://nature.com/article1",
          source: "semantic_scholar",
          score: 0.95,
          citationCount: 1500,
        },
        {
          title: "BERT: Pre-training of Deep Bidirectional Transformers",
          authors: ["Devlin, J.", "Chang, M.W."],
          year: 2019,
          doi: "10.18653/v1/N19-1423",
          abstract: "We introduce a new language representation model called BERT...",
          url: "https://aclanthology.org/N19-1423",
          source: "arxiv",
          score: 0.92,
          citationCount: 50000,
        },
        {
          title: "Attention Is All You Need",
          authors: ["Vaswani, A.", "Shazeer, N."],
          year: 2017,
          doi: "10.5555/3295222.3295349",
          abstract: "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks...",
          url: "https://arxiv.org/abs/1706.03762",
          source: "arxiv",
          score: 0.90,
          citationCount: 80000,
        },
        {
          title: "Random Forests for Medical Diagnosis",
          authors: ["Breiman, L."],
          year: 2001,
          doi: "10.1023/A:1010933404324",
          abstract: "Random forests are a combination of tree predictors such that each tree depends on the values of a random vector...",
          url: "https://link.springer.com/article",
          source: "pubmed",
          score: 0.85,
          citationCount: 30000,
        },
        {
          title: "Support Vector Machines for Classification",
          authors: ["Cortes, C.", "Vapnik, V."],
          year: 1995,
          doi: "10.1007/BF00994018",
          abstract: "The support-vector network is a new learning machine for two-group classification problems...",
          url: "https://link.springer.com/article2",
          source: "semantic_scholar",
          score: 0.88,
          citationCount: 25000,
        },
      ];

      const deps = createMockDeps({
        searchPapers: async () => papers,
        rerankPapers: async (query, docs) =>
          docs
            .map((d, i) => ({ ...d, relevanceScore: docs.length - i, rank: i + 1 }))
            .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0)),
      });

      // Step 1: Search
      const searchState = createBaseState({ query: "machine learning medical diagnosis" });
      const searchResult = await searchPapersNode(searchState, deps);
      expect(searchResult.papers).toHaveLength(5);

      // Step 2: Deduplicate
      const dedupState = createBaseState({ papers: searchResult.papers || [] });
      const dedupResult = await deduplicatePapersNode(dedupState, deps);
      expect(dedupResult.papers?.length).toBeGreaterThanOrEqual(3);

      // Step 3: Rank
      const rankState = createBaseState({ papers: dedupResult.papers || [] });
      const rankResult = await rankPapersNode(rankState, deps);
      expect(rankResult.rankedPapers?.length).toBeGreaterThanOrEqual(3);

      // Step 4: Screen
      const screenState = createBaseState({
        rankedPapers: rankResult.rankedPapers || [],
        query: "machine learning medical diagnosis",
      });
      const screenResult = await screenPapersNode(screenState, deps);
      expect(screenResult.screenedPapers?.length).toBeGreaterThanOrEqual(1);

      // Step 5: Extract
      const extractState = createBaseState({
        screenedPapers: screenResult.screenedPapers || [],
        confirmedColumns: [
          { id: "year", name: "Year", isVisible: true },
          { id: "method", name: "Method", instructions: "What ML method?", isVisible: true },
        ],
        query: "machine learning medical diagnosis",
      });
      const extractResult = await extractDataNode(extractState, deps);
      expect(Object.keys(extractResult.extractedData || {}).length).toBeGreaterThanOrEqual(0);

      // Step 6: Generate table
      const tableState = createBaseState({
        extractedData: extractResult.extractedData || {},
        screenedPapers: screenResult.screenedPapers || [],
        confirmedColumns: [
          { id: "year", name: "Year", isVisible: true },
          { id: "method", name: "Method", instructions: "What ML method?", isVisible: true },
        ],
        query: "machine learning medical diagnosis",
      });
      const tableResult = await generateTableNode(tableState, deps);
      expect(tableResult.tableColumns).toBeDefined();
    });
  });
});
