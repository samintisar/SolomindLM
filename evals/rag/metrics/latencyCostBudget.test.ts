import { describe, expect, it } from "vitest";
import type { EvalFixture, EvalRunArtifact } from "../types";
import { latencyCostBudget } from "./index";

const literatureReviewFixture: EvalFixture = {
  schemaVersion: 1,
  id: "lr",
  runner: "literatureReview",
  question: "q",
  notebookId: "nb",
  expectedItems: [],
  expectedBehavior: "b",
  tags: [],
};

function artifact(partial: Partial<EvalRunArtifact> = {}): EvalRunArtifact {
  return {
    caseId: "lr",
    runner: "literatureReview",
    configHash: "h",
    answer: "a",
    citations: [],
    preRerankChunks: [],
    postRerankChunks: [],
    selectedChunks: [],
    subQueries: [],
    latencyMs: 10,
    timestamp: "2026-08-20T00:00:00.000Z",
    ...partial,
  };
}

describe("latencyCostBudget", () => {
  it("passes literatureReview under per-runner token gate without baseline", () => {
    const result = latencyCostBudget(
      literatureReviewFixture,
      artifact({
        latencyMs: 1000,
        tokenUsage: { prompt: 0, completion: 0, total: 12000 },
      })
    );
    expect(result.status).toBe("pass");
  });

  it("adds callCounters to the breakdown when the artifact has them", () => {
    const callCounters = {
      llmCalls: 4,
      embeddingCalls: 2,
      embeddingTexts: 2,
      rerankCalls: 1,
      rerankDocs: 8,
    };
    const result = latencyCostBudget(literatureReviewFixture, artifact({ callCounters }));
    expect(result.breakdown?.callCounters).toEqual(callCounters);
  });

  it("leaves callCounters out of the breakdown when the artifact lacks them", () => {
    const result = latencyCostBudget(literatureReviewFixture, artifact());
    expect(result.breakdown).not.toHaveProperty("callCounters");
  });
});
