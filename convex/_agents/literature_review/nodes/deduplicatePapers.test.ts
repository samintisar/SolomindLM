import { describe, it, expect } from "vitest";
import { deduplicatePapersNode } from "./deduplicatePapers";
import type { LiteratureReviewStateType } from "../state";
import type { LiteratureReviewNodeDeps } from "../types";

function createMockState(papers: Array<{
  title: string;
  authors: string[];
  doi?: string;
  score: number;
  abstract: string;
  url: string;
  source: "arxiv" | "semantic_scholar" | "pubmed";
}>): LiteratureReviewStateType {
  return {
    query: "test query",
    searchQueries: [],
    suggestedColumns: [],
    confirmedColumns: [],
    papers,
    rankedPapers: [],
    screenedPapers: [],
    extractedData: {},
    tableColumns: [],
    citations: [],
    tableId: undefined,
    reportId: undefined,
    progress: { phase: "deduplicating", percentage: 0, message: "" },
    error: undefined,
    sessionId: "",
    notebookId: "",
    userId: "",
  } as LiteratureReviewStateType;
}

function createMockDeps(): LiteratureReviewNodeDeps {
  return {
    apiKey: "test-key",
    smartModel: "test-model",
  };
}

describe("deduplicatePapersNode", () => {
  it("deduplicates papers by exact DOI match", async () => {
    const papers = [
      {
        title: "Paper One",
        authors: ["Author A"],
        doi: "10.1234/example",
        score: 0.8,
        abstract: "Abstract one",
        url: "https://example.com/1",
        source: "arxiv" as const,
      },
      {
        title: "Paper Two",
        authors: ["Author B"],
        doi: "10.1234/example",
        score: 0.9,
        abstract: "Abstract two",
        url: "https://example.com/2",
        source: "semantic_scholar" as const,
      },
    ];

    const state = createMockState(papers);
    const deps = createMockDeps();
    const result = await deduplicatePapersNode(state, deps);

    expect(result.papers).toHaveLength(1);
    // DOI deduplication keeps first occurrence (from deduplicatePapersService)
    expect(result.papers?.[0].title).toBe("Paper One");
  });

  it("deduplicates papers by fuzzy title match", async () => {
    const papers = [
      {
        title: "Machine Learning for Healthcare Applications",
        authors: ["Author A"],
        score: 0.7,
        abstract: "Abstract one",
        url: "https://example.com/1",
        source: "arxiv" as const,
      },
      {
        title: "Machine Learning for Healthcare Applicatons",
        authors: ["Author A"],
        score: 0.8,
        abstract: "Abstract two",
        url: "https://example.com/2",
        source: "semantic_scholar" as const,
      },
    ];

    const state = createMockState(papers);
    const deps = createMockDeps();
    const result = await deduplicatePapersNode(state, deps);

    expect(result.papers).toHaveLength(1);
  });

  it("keeps the higher-scoring duplicate when fuzzy match found", async () => {
    const papers = [
      {
        title: "Deep Learning in Medical Imaging",
        authors: ["Author A"],
        score: 0.6,
        abstract: "Abstract one",
        url: "https://example.com/1",
        source: "arxiv" as const,
      },
      {
        title: "Deep Learning in Medical Imagning",
        authors: ["Author B"],
        score: 0.9,
        abstract: "Abstract two",
        url: "https://example.com/2",
        source: "semantic_scholar" as const,
      },
    ];

    const state = createMockState(papers);
    const deps = createMockDeps();
    const result = await deduplicatePapersNode(state, deps);

    expect(result.papers).toHaveLength(1);
    expect(result.papers?.[0].score).toBe(0.9);
    expect(result.papers?.[0].authors).toEqual(["Author B"]);
  });

  it("keeps unique papers with different titles", async () => {
    const papers = [
      {
        title: "Paper One Title",
        authors: ["Author A"],
        score: 0.8,
        abstract: "Abstract one",
        url: "https://example.com/1",
        source: "arxiv" as const,
      },
      {
        title: "Completely Different Paper",
        authors: ["Author B"],
        score: 0.7,
        abstract: "Abstract two",
        url: "https://example.com/2",
        source: "semantic_scholar" as const,
      },
    ];

    const state = createMockState(papers);
    const deps = createMockDeps();
    const result = await deduplicatePapersNode(state, deps);

    expect(result.papers).toHaveLength(2);
  });

  it("reports correct duplicate count in progress", async () => {
    const papers = [
      {
        title: "Duplicate Paper",
        authors: ["Author A"],
        doi: "10.1234/dup",
        score: 0.8,
        abstract: "Abstract one",
        url: "https://example.com/1",
        source: "arxiv" as const,
      },
      {
        title: "Duplicate Paper",
        authors: ["Author A"],
        doi: "10.1234/dup",
        score: 0.9,
        abstract: "Abstract two",
        url: "https://example.com/2",
        source: "semantic_scholar" as const,
      },
    ];

    const state = createMockState(papers);
    const deps = createMockDeps();
    const result = await deduplicatePapersNode(state, deps);

    expect(result.progress?.message).toContain("1 unique papers remain");
    expect(result.progress?.percentage).toBe(35);
  });
});
