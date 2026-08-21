import { describe, expect, it } from "vitest";
import type { EvalFixture, EvalRunArtifact } from "../types";
import { contextTokenBudgetRatio, stageTokenShare } from "./stageBudget";

const fixture: EvalFixture = {
  schemaVersion: 1,
  id: "c",
  runner: "chat",
  question: "q",
  notebookId: "nb",
  expectedItems: [],
  expectedBehavior: "b",
  tags: [],
};

function artifact(partial: Partial<EvalRunArtifact> = {}): EvalRunArtifact {
  return {
    caseId: "c",
    runner: "chat",
    configHash: "h",
    answer: "a",
    citations: [],
    preRerankChunks: [],
    postRerankChunks: [],
    selectedChunks: [{ id: "1", sourceTitle: "D", content: "x".repeat(400) }],
    subQueries: [],
    latencyMs: 10,
    timestamp: "2026-08-20T00:00:00.000Z",
    ...partial,
  };
}

describe("contextTokenBudgetRatio", () => {
  it("is selected tokens divided by 8000", () => {
    const result = contextTokenBudgetRatio(fixture, artifact());
    expect(result.metric).toBe("context_token_budget_ratio");
    expect(result.status).toBe("info");
    expect(result.score).toBeCloseTo(100 / 8000, 5);
  });
});

describe("stageTokenShare", () => {
  it("is info when no spans", () => {
    const result = stageTokenShare(fixture, artifact());
    expect(result.status).toBe("info");
    expect(result.score).toBe(0);
  });

  it("reports map share of stage tokens", () => {
    const result = stageTokenShare(
      fixture,
      artifact({
        stageSpans: [
          { stage: "map", latencyMs: 10, tokenUsage: { prompt: 80, completion: 20, total: 100 } },
          { stage: "reduce", latencyMs: 10, tokenUsage: { prompt: 10, completion: 40, total: 50 } },
        ],
      })
    );
    expect(result.breakdown?.mapShare).toBeCloseTo(100 / 150, 5);
  });
});
