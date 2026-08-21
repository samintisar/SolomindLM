import { describe, expect, it } from "vitest";
import type { EvalFixture, EvalRunArtifact } from "../types";
import { citationValidity } from "./index";

function fixtureWithBehavior(expectedBehavior: string): EvalFixture {
  return {
    schemaVersion: 1,
    id: "citation-validity-test",
    runner: "research",
    question: "Q?",
    notebookId: "nb",
    expectedItems: ["inflation"],
    expectedBehavior,
    tags: ["research"],
  };
}

function artifactWithCitations(citations: string[]): EvalRunArtifact {
  return {
    caseId: "citation-validity-test",
    runner: "research",
    configHash: "hash",
    answer: "Inflation rose after supply shocks.",
    citations,
    preRerankChunks: [],
    postRerankChunks: [],
    selectedChunks: [{ id: "ev_0", sourceTitle: "CEPR", content: "Inflation." }],
    subQueries: [],
    latencyMs: 1,
    timestamp: "2026-08-20T00:00:00.000Z",
  };
}

describe("citationValidity", () => {
  it("does not require inline citations when expectedBehavior only mentions retrieval sources", () => {
    const result = citationValidity(
      fixtureWithBehavior(
        "Should retrieve evidence from multiple sources covering inflation causes."
      ),
      artifactWithCitations([])
    );
    expect(result.status).toBe("pass");
    expect(result.breakdown?.expectsCitation).toBe(false);
  });

  it("fails when expectedBehavior explicitly requires citations and the answer has none", () => {
    const result = citationValidity(
      fixtureWithBehavior(
        "Should explain the mechanism in depth with citations from multiple sources."
      ),
      artifactWithCitations([])
    );
    expect(result.status).toBe("fail");
    expect(result.breakdown?.expectsCitation).toBe(true);
  });
});
