import { describe, expect, it, vi } from "vitest";
import type { LiteratureReviewEvalResult } from "../runners/literatureReviewRunner";
import type { EvalFixture, EvalRunArtifact } from "../types";
import {
  lrCitationKeyValidity,
  lrNumericGrounding,
  lrPrismaConsistency,
  lrRequiredSectionNames,
  scoreLiteratureReviewLlmJudgeMetrics,
  scoreLiteratureReviewMetrics,
} from "./literatureReview";

function stubArtifact(raw: LiteratureReviewEvalResult): EvalRunArtifact {
  return {
    caseId: "test",
    runner: "literatureReview",
    configHash: "hash",
    answer: "",
    citations: [],
    preRerankChunks: [],
    postRerankChunks: [],
    selectedChunks: [],
    subQueries: [],
    studioOutput: { kind: "literatureReview", raw },
    latencyMs: 0,
    timestamp: new Date().toISOString(),
  };
}

const fixture: EvalFixture = {
  schemaVersion: 1,
  id: "lr-test",
  runner: "literatureReview",
  question: "Benchmark reliability",
  notebookId: "nb",
  expectedItems: [],
  expectedBehavior: "test",
  tags: ["literature-review"],
};

describe("literatureReview metrics", () => {
  it("lr_required_section_names fails when core sections are missing", () => {
    const raw: LiteratureReviewEvalResult = {
      sessionId: "s",
      tableId: "t",
      reportId: "r",
      searchQueries: [],
      confirmedColumns: [],
      counts: { found: 0, deduplicated: 0, screened: 0, included: 0, extractedRows: 0 },
      stagePapers: { search: [], deduped: [], ranked: [], screened: [] },
      screeningDecisions: [],
      extractionCoverage: [],
      extractionSamples: [],
      table: { title: "T", columns: [], papers: [] },
      report: {
        title: "R",
        content: "",
        sections: [{ heading: "Abstract", content: "x" }],
      },
      latencyMs: 0,
    };
    const result = lrRequiredSectionNames(fixture, stubArtifact(raw));
    expect(result.status).not.toBe("pass");
  });

  it("lr_numeric_grounding flags invented percentages", () => {
    const raw: LiteratureReviewEvalResult = {
      sessionId: "s",
      tableId: "t",
      reportId: "r",
      searchQueries: [],
      confirmedColumns: [],
      counts: { found: 10, deduplicated: 8, screened: 5, included: 3, extractedRows: 3 },
      workflowProvenance: {
        recordsIdentified: 10,
        recordsAfterDedupe: 8,
        recordsIncluded: 3,
      },
      stagePapers: { search: [], deduped: [], ranked: [], screened: [] },
      screeningDecisions: [],
      extractionCoverage: [],
      extractionSamples: [],
      table: {
        title: "T",
        columns: [],
        papers: [{ rowData: { title: "Paper A" }, isIncluded: true }],
      },
      report: {
        title: "R",
        content: "We found a 99.9% improvement in F1=0.99 across studies.",
        sections: [],
      },
      latencyMs: 0,
    };
    const result = lrNumericGrounding(fixture, stubArtifact(raw));
    expect(result.score).toBeLessThan(1);
  });

  it("lr_prisma_consistency uses workflow provenance counts", () => {
    const raw: LiteratureReviewEvalResult = {
      sessionId: "s",
      tableId: "t",
      reportId: "r",
      searchQueries: [],
      confirmedColumns: [],
      counts: { found: 100, deduplicated: 80, screened: 30, included: 12, extractedRows: 12 },
      workflowProvenance: {
        recordsIdentified: 100,
        recordsAfterDedupe: 80,
        recordsScreened: 30,
        recordsIncluded: 12,
      },
      stagePapers: { search: [], deduped: [], ranked: [], screened: [] },
      screeningDecisions: [],
      extractionCoverage: [],
      extractionSamples: [],
      table: { title: "T", columns: [], papers: [] },
      report: {
        title: "R",
        content: "",
        sections: [
          { heading: "Methods", content: "12 studies were included after screening 30 records." },
        ],
      },
      latencyMs: 0,
    };
    const result = lrPrismaConsistency(fixture, stubArtifact(raw));
    expect(result.status).toBe("pass");
  });

  it("lr_citation_key_validity rejects malformed keys", () => {
    const raw: LiteratureReviewEvalResult = {
      sessionId: "s",
      tableId: "t",
      reportId: "r",
      searchQueries: [],
      confirmedColumns: [],
      counts: { found: 0, deduplicated: 0, screened: 0, included: 0, extractedRows: 0 },
      stagePapers: { search: [], deduped: [], ranked: [], screened: [] },
      screeningDecisions: [],
      extractionCoverage: [],
      extractionSamples: [],
      table: { title: "T", columns: [], papers: [] },
      report: {
        title: "R",
        content: "Prior work [im, 2026] and [Kim2026] disagree.",
        sections: [],
      },
      latencyMs: 0,
    };
    const result = lrCitationKeyValidity(fixture, stubArtifact(raw));
    expect(result.breakdown?.invalid).toBeTruthy();
  });
});

/** A review of the user's notebook papers, with or without a database search (#301). */
function notebookReview(
  overrides: Partial<LiteratureReviewEvalResult> & { methods: string }
): LiteratureReviewEvalResult {
  const { methods, ...rest } = overrides;
  return {
    sessionId: "s",
    tableId: "t",
    reportId: "r",
    searchQueries: [],
    confirmedColumns: [],
    counts: {
      found: 0,
      deduplicated: 0,
      screened: 0,
      included: 0,
      fromNotebook: 4,
      extractedRows: 4,
    },
    workflowProvenance: { searchSkipped: true, recordsFromNotebook: 4 },
    stagePapers: { search: [], deduped: [], ranked: [], screened: [] },
    screeningDecisions: [],
    extractionCoverage: [],
    extractionSamples: [],
    table: { title: "T", columns: [], papers: [] },
    report: { title: "R", content: "", sections: [{ heading: "Methods", content: methods }] },
    latencyMs: 0,
    ...rest,
  };
}

describe("literatureReview metrics with notebook papers", () => {
  it("lr_numeric_grounding accepts the included total that counts notebook papers", () => {
    const raw = notebookReview({
      methods: "16 studies were included, 12 of them from the 30 records screened.",
      counts: {
        found: 100,
        deduplicated: 80,
        screened: 30,
        included: 12,
        fromNotebook: 4,
        extractedRows: 0,
      },
      workflowProvenance: {
        recordsIdentified: 100,
        recordsAfterDedupe: 80,
        recordsScreened: 30,
        recordsIncluded: 12,
        recordsFromNotebook: 4,
      },
    });
    raw.report.content = raw.report.sections[0].content;
    const result = lrNumericGrounding(fixture, stubArtifact(raw));
    expect(result.breakdown).toMatchObject({ ungrounded: [] });
  });

  it("search, ranking and screening metrics don't apply when no search ran", () => {
    const results = scoreLiteratureReviewMetrics(
      fixture,
      stubArtifact(notebookReview({ methods: "4 studies from your notebook were included." }))
    );
    const statusOf = (metric: string) => results.find((r) => r.metric === metric)?.status;

    expect(statusOf("lr_search_yield")).toBe("info");
    expect(statusOf("lr_ranking_top_relevance")).toBe("info");
    expect(statusOf("lr_screening_inclusion_rate")).toBe("info");
  });

  it("lr_prisma_consistency doesn't take a number inside another for the included count", () => {
    const result = lrPrismaConsistency(
      fixture,
      stubArtifact(notebookReview({ methods: "Data were collected in 2014 using the PHQ-9." }))
    );
    expect(result.breakdown).toMatchObject({ mentionsIncluded: false });
  });

  it("lr_prisma_consistency reads comma-grouped numbers whole", () => {
    const four = lrPrismaConsistency(
      fixture,
      stubArtifact(notebookReview({ methods: "Of 4,000 records, none were screened." }))
    );
    expect(four.breakdown).toMatchObject({ mentionsIncluded: false });

    const many = lrPrismaConsistency(
      fixture,
      stubArtifact(
        notebookReview({
          methods: "1,204 studies from your notebook were included.",
          counts: {
            found: 0,
            deduplicated: 0,
            screened: 0,
            included: 0,
            fromNotebook: 1204,
            extractedRows: 0,
          },
          workflowProvenance: { searchSkipped: true, recordsFromNotebook: 1204 },
        })
      )
    );
    expect(many.breakdown).toMatchObject({ mentionsIncluded: true });
  });

  it("lr_prisma_consistency doesn't take a hyphenated number for the included count", () => {
    const result = lrPrismaConsistency(
      fixture,
      stubArtifact(notebookReview({ methods: "Cohorts had a 4-year follow-up." }))
    );
    expect(result.breakdown).toMatchObject({ mentionsIncluded: false });
  });

  it("lr_prisma_consistency counts notebook papers when no search ran", () => {
    const result = lrPrismaConsistency(
      fixture,
      stubArtifact(notebookReview({ methods: "4 studies from your notebook were included." }))
    );
    expect(result.status).toBe("pass");
    expect(result.breakdown).toMatchObject({ included: 4, fromNotebook: 4 });
  });

  it("lr_prisma_consistency adds notebook papers to the included search papers", () => {
    const raw = notebookReview({
      methods: "16 studies were included: 12 after screening 30 records, and 4 from your notebook.",
      counts: {
        found: 100,
        deduplicated: 80,
        screened: 30,
        included: 12,
        fromNotebook: 4,
        extractedRows: 16,
      },
      workflowProvenance: {
        recordsIdentified: 100,
        recordsAfterDedupe: 80,
        recordsScreened: 30,
        recordsIncluded: 12,
        recordsFromNotebook: 4,
      },
    });
    const result = lrPrismaConsistency(fixture, stubArtifact(raw));
    expect(result.status).toBe("pass");
    expect(result.breakdown).toMatchObject({ included: 16, includedFromSearch: 12 });
  });
});

describe("literatureReview Likert judges", () => {
  const raw: LiteratureReviewEvalResult = {
    sessionId: "s",
    tableId: "t",
    reportId: "r",
    searchQueries: [],
    confirmedColumns: [],
    counts: { found: 1, deduplicated: 1, screened: 1, included: 1, extractedRows: 1 },
    stagePapers: { search: [], deduped: [], ranked: [], screened: [] },
    screeningDecisions: [],
    extractionCoverage: [],
    extractionSamples: [{ paperTitle: "P", columnName: "C", extractedValue: "v" }],
    table: { title: "T", columns: [], papers: [] },
    report: { title: "R", content: "A report body.", sections: [] },
    latencyMs: 0,
  };

  it("use the injected invoker and model", async () => {
    const invoke = vi.fn().mockResolvedValue('{"score": 0.9, "reasoning": "good"}');
    const results = await scoreLiteratureReviewLlmJudgeMetrics(fixture, stubArtifact(raw), {
      invoke,
      model: "judge-x",
    });
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(results.map((r) => [r.metric, r.status, r.score])).toEqual([
      ["lr_llm_judge_report_quality", "pass", 0.9],
      ["lr_llm_judge_completeness", "pass", 0.9],
      ["lr_llm_judge_extraction_quality", "pass", 0.9],
    ]);
    expect(results[0].breakdown).toMatchObject({ model: "judge-x" });
  });

  it("fail on an unparseable response instead of guessing a score", async () => {
    const invoke = vi.fn().mockResolvedValue("Looks fine to me.");
    const results = await scoreLiteratureReviewLlmJudgeMetrics(fixture, stubArtifact(raw), {
      invoke,
    });
    expect(results.map((r) => [r.status, r.score])).toEqual([
      ["fail", 0],
      ["fail", 0],
      ["fail", 0],
    ]);
    expect(results[0].detail).toMatch(/^LLM judge failed:/);
  });

  it("fail each judge, not the batch, when the judge client can't be built", async () => {
    vi.stubEnv("TOGETHER_AI_API_KEY", "");
    try {
      const results = await scoreLiteratureReviewLlmJudgeMetrics(fixture, stubArtifact(raw), {});
      expect(results.map((r) => [r.metric, r.status, r.score])).toEqual([
        ["lr_llm_judge_report_quality", "fail", 0],
        ["lr_llm_judge_completeness", "fail", 0],
        ["lr_llm_judge_extraction_quality", "fail", 0],
      ]);
      expect(results[2].detail).toMatch(/TOGETHER_AI_API_KEY/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
