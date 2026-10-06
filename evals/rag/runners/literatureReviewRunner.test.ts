import { describe, expect, it, vi } from "vitest";
import type { EvalFixture } from "../types";
import { snapshotRetrievalConfig } from "./config";
import type { LiteratureReviewEvalResult, LiteratureReviewInvoker } from "./literatureReviewRunner";
import { runLiteratureReviewEval } from "./literatureReviewRunner";

const fixture: EvalFixture = {
  schemaVersion: 1,
  id: "lr",
  runner: "literatureReview",
  question: "q",
  notebookId: "nb",
  expectedItems: ["x"],
  expectedBehavior: "b",
  tags: [],
};

const result: LiteratureReviewEvalResult = {
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
    fromNotebook: 2,
    extractedRows: 2,
  },
  stagePapers: { search: [], deduped: [], ranked: [], screened: [] },
  screeningDecisions: [],
  extractionCoverage: [],
  extractionSamples: [],
  table: { title: "T", columns: [], papers: [] },
  report: { title: "R", content: "", sections: [] },
  latencyMs: 1,
};

describe("runLiteratureReviewEval notebook papers", () => {
  it("passes the fixture's documents and paper scope to the eval action", async () => {
    const invoke = vi.fn(async () => result);
    const invoker: LiteratureReviewInvoker = { invoke };

    const { errors } = await runLiteratureReviewEval(
      {
        fixture: {
          ...fixture,
          documentIds: ["d1", "d2"],
          studioParams: { paperScope: "papers_only" },
        },
        config: snapshotRetrievalConfig(),
      },
      invoker
    );

    expect(errors).toEqual([]);
    expect(invoke).toHaveBeenCalledWith({
      question: "q",
      notebookId: "nb",
      documentIds: ["d1", "d2"],
      paperScope: "papers_only",
    });
  });

  it("sends no papers for a fixture without documents", async () => {
    const invoke = vi.fn(async () => result);

    await runLiteratureReviewEval({ fixture, config: snapshotRetrievalConfig() }, { invoke });

    expect(invoke).toHaveBeenCalledWith({ question: "q", notebookId: "nb" });
  });
});
