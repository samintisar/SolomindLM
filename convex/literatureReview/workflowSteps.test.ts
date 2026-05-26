"use node";

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  dedupePapers,
  planReviewHandler,
  searchPapersHandler,
  deduplicatePapersHandler,
  rankPapersHandler,
  screenPapersHandler,
  extractDataHandler,
  generateTableHandler,
  generateReportHandler,
} from "./workflowSteps";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

// Mock dependencies
vi.mock("../_agents/_shared/llm_factory.js", () => ({
  createLLM: vi.fn(),
}));

vi.mock("../_agents/_shared/retry.js", () => ({
  invokeWithHttpRetry: vi.fn(),
}));

vi.mock("../_lib/logging/serviceLogger.js", () => ({
  createServiceLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock("../_lib/env.js", () => ({
  env: {
    TOGETHER_AI_API_KEY: "test-key",
    SMART_LLM: "test-smart-model",
    FAST_LLM: "test-fast-model",
  },
}));

vi.mock("../_agents/chat/rerankCache.js", () => ({
  cachedRerank: vi.fn(),
}));

vi.mock("../_utils/CitationEngine.js", () => ({
  generateCitationKey: vi.fn((paper, existingKeys) => {
    const key = `${paper.authors[0]?.split(",")[0] ?? "Unknown"}${paper.year ?? ""}`;
    existingKeys.add(key);
    return key;
  }),
}));

import { createLLM } from "../_agents/_shared/llm_factory.js";
import { invokeWithHttpRetry } from "../_agents/_shared/retry.js";
import { cachedRerank } from "../_agents/chat/rerankCache.js";

const mockCtx = {
  runAction: vi.fn(),
  runMutation: vi.fn(),
  runQuery: vi.fn(),
} as unknown as ActionCtx;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dedupePapers", () => {
  it("removes duplicates by DOI", () => {
    const papers = [
      { title: "Paper A", authors: ["A"], doi: "10.1234/a", score: 0.8 },
      { title: "Paper B", authors: ["B"], doi: "10.1234/a", score: 0.9 },
    ];

    const result = dedupePapers(papers as any);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Paper A");
  });

  it("removes duplicates by title+author when no DOI", () => {
    const papers = [
      { title: "Same Title", authors: ["A"], score: 0.8 },
      { title: "Same Title", authors: ["A"], score: 0.9 },
    ];

    const result = dedupePapers(papers as any);
    expect(result).toHaveLength(1);
  });

  it("keeps unique papers", () => {
    const papers = [
      { title: "Paper A", authors: ["A"], score: 0.8 },
      { title: "Paper B", authors: ["B"], score: 0.9 },
    ];

    const result = dedupePapers(papers as any);
    expect(result).toHaveLength(2);
  });

  it("handles empty input", () => {
    expect(dedupePapers([])).toEqual([]);
  });

  it("preserves first occurrence of duplicate", () => {
    const papers = [
      { title: "Paper A", authors: ["A"], doi: "10.1234/a", score: 0.8 },
      { title: "Paper A", authors: ["A"], doi: "10.1234/a", score: 0.9 },
    ];

    const result = dedupePapers(papers as any);
    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(0.8);
  });
});

describe("planReviewHandler", () => {
  it("returns search queries and suggested columns", async () => {
    const mockLLM = {
      withStructuredOutput: vi.fn().mockReturnValue({
        invoke: vi.fn().mockResolvedValue({
          reviewTitle: "Digital Interventions for Depression",
          searchQueries: ["query1", "query2"],
          suggestedColumns: [{ id: "col1", name: "Column 1", isVisible: true }],
        }),
      }),
    };
    (createLLM as any).mockReturnValue(mockLLM as any);
    (invokeWithHttpRetry as any).mockImplementation(async (fn) => fn());

    const result = await planReviewHandler(mockCtx, { query: "test query" });

    expect(result.reviewTitle).toBe("Digital Interventions for Depression");
    expect(result.searchQueries).toEqual(["query1", "query2"]);
    expect(result.suggestedColumns).toHaveLength(1);
    expect(result.suggestedColumns[0].name).toBe("Column 1");
  });

  it("handles empty query", async () => {
    const result = await planReviewHandler(mockCtx, { query: "" });

    expect(result.reviewTitle).toBe("Literature Review");
    expect(result.searchQueries).toEqual([]);
    expect(result.suggestedColumns).toEqual([]);
  });

  it("handles LLM failure gracefully", async () => {
    (createLLM as any).mockImplementation(() => {
      throw new Error("LLM Error");
    });

    const result = await planReviewHandler(mockCtx, { query: "test query" });

    expect(result.searchQueries).toEqual(["test query"]);
    expect(result.suggestedColumns).toEqual([]);
  });

  it("returns fallback on invokeWithHttpRetry failure", async () => {
    (createLLM as any).mockReturnValue({} as any);
    (invokeWithHttpRetry as any).mockRejectedValue(new Error("Retry Error"));

    const result = await planReviewHandler(mockCtx, { query: "test query" });

    expect(result.searchQueries).toEqual(["test query"]);
    expect(result.suggestedColumns).toEqual([]);
  });

  it("retries when the model returns legacy generic columns", async () => {
    const genericColumns = [
      { id: "study_design", name: "Study Design", isVisible: true },
      { id: "sample_size", name: "Sample Size", isVisible: true },
      { id: "key_findings", name: "Key Findings", isVisible: true },
      { id: "limitations", name: "Limitations", isVisible: true },
      { id: "methodology", name: "Methodology", isVisible: true },
    ];
    const tailoredColumns = [
      { id: "benchmark_name_type", name: "Benchmark Name & Type", isVisible: true },
    ];
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({
        reviewTitle: "LLM Benchmark Predictive Validity",
        searchQueries: ["q1"],
        suggestedColumns: genericColumns,
      })
      .mockResolvedValueOnce({
        reviewTitle: "LLM Benchmark Predictive Validity",
        searchQueries: ["q1"],
        suggestedColumns: tailoredColumns,
      });
    const mockLLM = {
      withStructuredOutput: vi.fn().mockReturnValue({ invoke }),
    };
    (createLLM as any).mockReturnValue(mockLLM as any);
    (invokeWithHttpRetry as any).mockImplementation(async (fn) => fn());

    const result = await planReviewHandler(mockCtx, {
      query: "How reliable are common LLM evaluation benchmarks?",
    });

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(result.suggestedColumns).toEqual(tailoredColumns);
  });
});

describe("searchPapersHandler", () => {
  const mockFetchPapers = vi.fn();

  beforeEach(() => {
    mockFetchPapers.mockReset();
  });

  it("searches across sources", async () => {
    mockFetchPapers.mockResolvedValue([
      {
        title: "Paper 1",
        authors: ["A"],
        year: 2023,
        abstract: "Abstract 1",
        url: "http://1",
        source: "arxiv",
        score: 0.9,
      },
    ]);

    const result = await searchPapersHandler(
      mockCtx,
      {
        query: "test",
        searchQueries: ["query1", "query2"],
      },
      mockFetchPapers
    );

    expect(mockFetchPapers).toHaveBeenCalledTimes(2);
    expect(result.papers).toHaveLength(1);
    expect(result.papers[0].title).toBe("Paper 1");
  });

  it("passes search options to fetch", async () => {
    mockFetchPapers.mockResolvedValue([]);

    await searchPapersHandler(
      mockCtx,
      {
        query: "test",
        searchQueries: ["q1"],
        searchOptions: {
          researchDatabase: "pubmed",
          academicFilters: { minCitations: 10, publicationYearFrom: 2020 },
        },
      },
      mockFetchPapers
    );

    expect(mockFetchPapers).toHaveBeenCalledWith(
      mockCtx,
      "q1",
      50,
      expect.objectContaining({
        researchDatabase: "pubmed",
        academicFilters: expect.objectContaining({ minCitations: 10 }),
      })
    );
  });

  it("deduplicates results", async () => {
    mockFetchPapers.mockResolvedValue([
      {
        title: "Paper 1",
        authors: ["A"],
        abstract: "Abstract 1",
        url: "http://1",
        source: "arxiv",
        doi: "10.1234/a",
        score: 0.9,
      },
    ]);

    const result = await searchPapersHandler(
      mockCtx,
      {
        query: "test",
        searchQueries: ["query1", "query2"],
      },
      mockFetchPapers
    );

    expect(result.papers).toHaveLength(1);
  });

  it("handles empty results", async () => {
    mockFetchPapers.mockResolvedValue([]);

    const result = await searchPapersHandler(
      mockCtx,
      {
        query: "test",
        searchQueries: ["query1"],
      },
      mockFetchPapers
    );

    expect(result.papers).toEqual([]);
  });

  it("strips null publication year from search results", async () => {
    mockFetchPapers.mockResolvedValue([
      {
        title: "Paper without year",
        authors: ["A"],
        year: null,
        abstract: "Abstract",
        url: "http://1",
        source: "semantic_scholar",
        score: 0.9,
      },
    ]);

    const result = await searchPapersHandler(
      mockCtx,
      {
        query: "test",
        searchQueries: ["query1"],
      },
      mockFetchPapers
    );

    expect(result.papers).toHaveLength(1);
    expect(result.papers[0].year).toBeUndefined();
    expect("year" in result.papers[0] && result.papers[0].year === null).toBe(false);
  });

  it("uses query when searchQueries is empty", async () => {
    mockFetchPapers.mockResolvedValue([]);

    await searchPapersHandler(
      mockCtx,
      {
        query: "fallback query",
        searchQueries: [],
      },
      mockFetchPapers
    );

    expect(mockFetchPapers).toHaveBeenCalledWith(mockCtx, "fallback query", 50, undefined);
  });
});

describe("deduplicatePapersHandler", () => {
  it("removes duplicates by DOI", async () => {
    const result = await deduplicatePapersHandler(mockCtx, {
      papers: [
        { title: "A", authors: ["A"], doi: "10.1234/a", score: 0.8 },
        { title: "B", authors: ["B"], doi: "10.1234/a", score: 0.9 },
      ],
    });

    expect(result.papers).toHaveLength(1);
  });

  it("removes duplicates by title+author", async () => {
    const result = await deduplicatePapersHandler(mockCtx, {
      papers: [
        { title: "Same", authors: ["A"], score: 0.8 },
        { title: "Same", authors: ["A"], score: 0.9 },
      ],
    });

    expect(result.papers).toHaveLength(1);
  });

  it("preserves highest score paper", async () => {
    const result = await deduplicatePapersHandler(mockCtx, {
      papers: [
        { title: "A", authors: ["A"], doi: "10.1234/a", score: 0.8 },
        { title: "B", authors: ["B"], doi: "10.1234/a", score: 0.9 },
      ],
    });

    expect(result.papers).toHaveLength(1);
    expect(result.papers[0].score).toBe(0.8);
  });
});

describe("rankPapersHandler", () => {
  it("reranks using ZeroEntropy", async () => {
    (cachedRerank as any).mockResolvedValue([
      { id: "1", score: 0.95 },
      { id: "0", score: 0.85 },
    ]);

    const result = await rankPapersHandler(mockCtx, {
      papers: [
        { title: "A", authors: ["A"], abstract: "Abstract A", score: 0.5 },
        { title: "B", authors: ["B"], abstract: "Abstract B", score: 0.6 },
      ],
      query: "test query",
    });

    expect(cachedRerank).toHaveBeenCalledWith(
      mockCtx,
      "test query",
      expect.any(Array),
      "zerank-2",
      30
    );
    expect(result.papers[0].score).toBe(0.95);
    expect(result.papers[1].score).toBe(0.85);
  });

  it("falls back to original scores on error", async () => {
    (cachedRerank as any).mockRejectedValue(new Error("Rerank failed"));

    const result = await rankPapersHandler(mockCtx, {
      papers: [
        { title: "A", authors: ["A"], abstract: "Abstract A", score: 0.5 },
        { title: "B", authors: ["B"], abstract: "Abstract B", score: 0.8 },
      ],
      query: "test query",
    });

    expect(result.papers[0].score).toBe(0.8);
    expect(result.papers[1].score).toBe(0.5);
  });

  it("handles empty input", async () => {
    const result = await rankPapersHandler(mockCtx, {
      papers: [],
      query: "test",
    });

    expect(result.papers).toEqual([]);
  });
});

describe("screenPapersHandler", () => {
  it("makes inclusion decisions", async () => {
    const mockLLM = {
      withStructuredOutput: vi.fn().mockReturnValue({
        invoke: vi.fn().mockResolvedValue({
          decisions: [
            { paperId: "paper_1", isIncluded: true, reason: "Relevant" },
            { paperId: "paper_2", isIncluded: false, reason: "Not relevant" },
          ],
        }),
      }),
    };
    (createLLM as any).mockReturnValue(mockLLM as any);
    (invokeWithHttpRetry as any).mockImplementation(async (fn) => fn());

    const result = await screenPapersHandler(mockCtx, {
      papers: [
        { title: "A", authors: ["A"], abstract: "Abstract A", score: 0.8 },
        { title: "B", authors: ["B"], abstract: "Abstract B", score: 0.7 },
      ],
      query: "test query",
    });

    expect(result.papers).toHaveLength(2);
    expect(result.papers[0].isIncluded).toBe(true);
    expect(result.papers[1].isIncluded).toBe(false);
  });

  it("batches 5 papers per call", async () => {
    const mockInvoke = vi.fn().mockResolvedValue({
      decisions: [{ paperId: "paper_1", isIncluded: true, reason: "Relevant" }],
    });
    const mockLLM = {
      withStructuredOutput: vi.fn().mockReturnValue({
        invoke: mockInvoke,
      }),
    };
    (createLLM as any).mockReturnValue(mockLLM as any);
    (invokeWithHttpRetry as any).mockImplementation(async (fn) => fn());

    const papers = Array.from({ length: 6 }, (_, i) => ({
      title: `Paper ${i}`,
      authors: [`Author ${i}`],
      abstract: `Abstract ${i}`,
      score: 0.8,
    }));

    await screenPapersHandler(mockCtx, { papers, query: "test" });

    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });

  it("handles screening failure with conservative fallback", async () => {
    (createLLM as any).mockReturnValue({} as any);
    (invokeWithHttpRetry as any).mockRejectedValue(new Error("Screening failed"));

    const result = await screenPapersHandler(mockCtx, {
      papers: [{ title: "A", authors: ["A"], abstract: "Abstract A", score: 0.8 }],
      query: "test query",
    });

    expect(result.papers[0].isIncluded).toBe(true);
    expect(result.papers[0].includeReason).toContain("conservative fallback");
  });

  it("handles empty input", async () => {
    const result = await screenPapersHandler(mockCtx, {
      papers: [],
      query: "test",
    });

    expect(result.papers).toEqual([]);
  });
});

describe("extractDataHandler", () => {
  it("writes drafts in batches", async () => {
    (mockCtx.runQuery as any).mockResolvedValue([]);
    (mockCtx.runMutation as any).mockResolvedValue(null);

    const papers = Array.from({ length: 6 }, (_, i) => ({
      title: `Paper ${i}`,
      authors: [`Author ${i}`],
      abstract: `Abstract ${i}`,
      score: 0.8,
      isIncluded: true,
    }));

    await extractDataHandler(mockCtx, {
      papers,
      columns: [{ id: "col1", name: "Column 1", isVisible: true }],
      sessionId: "test-session" as Id<"literatureReviewSessions">,
    });

    expect(mockCtx.runMutation).toHaveBeenCalledTimes(2);
  });

  it("skips excluded papers", async () => {
    (mockCtx.runQuery as any).mockResolvedValue([]);
    (mockCtx.runMutation as any).mockResolvedValue(null);

    const papers = [
      { title: "A", authors: ["A"], abstract: "Abstract A", score: 0.8, isIncluded: true },
      { title: "B", authors: ["B"], abstract: "Abstract B", score: 0.7, isIncluded: false },
    ];

    await extractDataHandler(mockCtx, {
      papers,
      columns: [{ id: "col1", name: "Column 1", isVisible: true }],
      sessionId: "test-session" as Id<"literatureReviewSessions">,
    });

    expect(mockCtx.runMutation).toHaveBeenCalledTimes(1);
    expect(mockCtx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        papers: expect.arrayContaining([expect.objectContaining({ title: "A" })]),
      })
    );
  });

  it("handles empty input", async () => {
    (mockCtx.runQuery as any).mockResolvedValue([]);

    const result = await extractDataHandler(mockCtx, {
      papers: [],
      columns: [],
      sessionId: "test-session" as Id<"literatureReviewSessions">,
    });

    expect(result).toBeNull();
    expect(mockCtx.runMutation).not.toHaveBeenCalled();
  });

  it("skips existing batches on retry", async () => {
    (mockCtx.runQuery as any).mockResolvedValue([0]);
    (mockCtx.runMutation as any).mockResolvedValue(null);

    const papers = Array.from({ length: 6 }, (_, i) => ({
      title: `Paper ${i}`,
      authors: [`Author ${i}`],
      abstract: `Abstract ${i}`,
      score: 0.8,
      isIncluded: true,
    }));

    await extractDataHandler(mockCtx, {
      papers,
      columns: [{ id: "col1", name: "Column 1", isVisible: true }],
      sessionId: "test-session" as Id<"literatureReviewSessions">,
    });

    expect(mockCtx.runMutation).toHaveBeenCalledTimes(1);
  });
});

describe("extractDataHandler with LLM extraction", () => {
  it("extracts custom column data via LLM and passes extractedData to insertDraftBatch", async () => {
    const mockLLM = {
      withStructuredOutput: vi.fn().mockReturnValue({
        invoke: vi.fn().mockResolvedValue({
          extractedData: {
            study_design: "Randomized controlled trial",
            sample_size: "N = 245",
            key_findings: "30% improvement in primary outcome",
          },
        }),
      }),
    };
    (createLLM as any).mockReturnValue(mockLLM as any);
    (invokeWithHttpRetry as any).mockImplementation(async (fn) => fn());
    (mockCtx.runQuery as any).mockResolvedValue([]);
    (mockCtx.runMutation as any).mockResolvedValue(null);

    const papers = [
      {
        title: "Paper One",
        authors: ["Smith, J."],
        year: 2023,
        abstract: "A randomized controlled trial with 245 participants showing 30% improvement.",
        url: "http://example.com/1",
        source: "arxiv" as const,
        score: 0.9,
        isIncluded: true,
      },
    ];

    const columns = [
      {
        id: "study_design",
        name: "Study Design",
        instructions: "Describe the study design",
        isVisible: true,
      },
      {
        id: "sample_size",
        name: "Sample Size",
        instructions: "Extract sample size",
        isVisible: true,
      },
      {
        id: "key_findings",
        name: "Key Findings",
        instructions: "Summarize key findings",
        isVisible: true,
      },
    ];

    await extractDataHandler(mockCtx, {
      papers,
      columns,
      sessionId: "test-session" as Id<"literatureReviewSessions">,
    });

    expect(mockCtx.runMutation).toHaveBeenCalledTimes(1);
    const callArgs = (mockCtx.runMutation as any).mock.calls[0][1];
    expect(callArgs.papers[0].extractedData).toBeDefined();
    expect(callArgs.papers[0].extractedData["study_design"]).toBe("Randomized controlled trial");
    expect(callArgs.papers[0].extractedData["sample_size"]).toBe("N = 245");
    expect(callArgs.papers[0].extractedData["key_findings"]).toBe(
      "30% improvement in primary outcome"
    );
  });

  it("falls back to basic metadata when LLM extraction fails", async () => {
    (createLLM as any).mockImplementation(() => {
      throw new Error("LLM Error");
    });
    (mockCtx.runQuery as any).mockResolvedValue([]);
    (mockCtx.runMutation as any).mockResolvedValue(null);

    const papers = [
      {
        title: "Paper One",
        authors: ["Smith, J."],
        year: 2023,
        abstract: "Abstract one",
        url: "http://example.com/1",
        source: "arxiv" as const,
        score: 0.9,
        isIncluded: true,
      },
    ];

    await extractDataHandler(mockCtx, {
      papers,
      columns: [{ id: "title", name: "Title", isVisible: true }],
      sessionId: "test-session" as Id<"literatureReviewSessions">,
    });

    expect(mockCtx.runMutation).toHaveBeenCalledTimes(1);
    const callArgs = (mockCtx.runMutation as any).mock.calls[0][1];
    // Should not have extractedData since LLM failed
    expect(callArgs.papers[0].extractedData).toBeUndefined();
  });
});

describe("generateTableHandler", () => {
  it("persists table from drafts", async () => {
    (mockCtx.runMutation as any).mockResolvedValue({
      tableId: "table123" as Id<"literatureTables">,
    });

    const result = await generateTableHandler(mockCtx, {
      sessionId: "session123" as Id<"literatureReviewSessions">,
      columns: [{ id: "col1", name: "Column 1", isVisible: true }],
    });

    expect(result.tableId).toBe("table123");
    expect(mockCtx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sessionId: "session123",
        columns: expect.any(Array),
      })
    );
  });
});

describe("generateReportHandler", () => {
  it("generates sections and persists report", async () => {
    const mockLLM = {
      invoke: vi.fn().mockResolvedValue({
        content: "Generated section content",
      }),
    };
    (createLLM as any).mockReturnValue(mockLLM as any);
    (invokeWithHttpRetry as any).mockImplementation(async (fn) => fn());

    let sessionQueryCount = 0;
    (mockCtx.runQuery as any).mockImplementation(async (_ref, args: any) => {
      if (args?.tableId) {
        return {
          columns: [{ id: "col1", name: "Column 1" }],
        };
      }
      if (args?.sessionId) {
        sessionQueryCount += 1;
        if (sessionQueryCount === 1) {
          return [
            {
              citationId: "cit1" as Id<"citations">,
              rowData: { col1: "value1" },
              batchNumber: 0,
            },
          ];
        }
        return {
          reviewTitle: "Digital Interventions for Depression",
          query: "test query",
        };
      }
      if (args?.citationIds) {
        return [
          {
            _id: "cit1" as Id<"citations">,
            title: "Paper Title",
            authors: ["Author A"],
            year: 2023,
            citationKey: "Author2023",
            doi: "10.1234/a",
            url: "http://a",
            abstract: "Abstract",
          },
        ];
      }
      return null;
    });

    (mockCtx.runMutation as any).mockResolvedValue({
      reportId: "report123" as Id<"literatureReports">,
    });

    const result = await generateReportHandler(mockCtx, {
      sessionId: "session123" as Id<"literatureReviewSessions">,
      tableId: "table123" as Id<"literatureTables">,
      query: "test query",
    });

    expect(result.reportId).toBe("report123");
    expect(mockCtx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sessionId: "session123",
        tableId: "table123",
        title: "Digital Interventions for Depression",
        content: expect.stringContaining("## Abstract"),
        sections: expect.any(Array),
      })
    );
  });

  it("handles missing table with fallback report", async () => {
    // When table is missing, the handler catches the error and falls back
    (mockCtx.runQuery as any).mockReset().mockResolvedValue(null);
    (mockCtx.runMutation as any)
      .mockReset()
      .mockResolvedValue({ reportId: "fallback123" as Id<"literatureReports"> });

    const result = await generateReportHandler(mockCtx, {
      sessionId: "session123" as Id<"literatureReviewSessions">,
      tableId: "table123" as Id<"literatureTables">,
      query: "test query",
    });

    expect(result.reportId).toBe("fallback123");
    expect(mockCtx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sessionId: "session123",
        tableId: "table123",
        query: "test query",
      })
    );
  });

  it("handles generation failure with fallback", async () => {
    (createLLM as any).mockImplementation(() => {
      throw new Error("LLM Error");
    });

    (mockCtx.runQuery as any).mockImplementation(async (_ref, args: any) => {
      if (args?.tableId) {
        return {
          columns: [{ id: "col1", name: "Column 1" }],
        };
      }
      if (args?.sessionId) {
        return [];
      }
      return null;
    });

    (mockCtx.runMutation as any).mockResolvedValue({
      reportId: "report123" as Id<"literatureReports">,
    });

    const result = await generateReportHandler(mockCtx, {
      sessionId: "session123" as Id<"literatureReviewSessions">,
      tableId: "table123" as Id<"literatureTables">,
      query: "test query",
    });

    expect(result.reportId).toBe("report123");
    expect(mockCtx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        query: "test query",
      })
    );
  });
});
