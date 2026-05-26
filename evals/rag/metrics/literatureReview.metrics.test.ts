import { describe, expect, it } from "vitest";
import type { EvalFixture, EvalRunArtifact } from "../types";
import type { LiteratureReviewEvalResult } from "../runners/literatureReviewRunner";
import {
  lrCitationKeyValidity,
  lrNumericGrounding,
  lrPrismaConsistency,
  lrRequiredSectionNames,
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
        sections: [{ heading: "Methods", content: "12 studies were included after screening 30 records." }],
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
