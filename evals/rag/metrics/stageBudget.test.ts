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
  it("divides by the artifact's contextTokenBudget when it has one", () => {
    const result = contextTokenBudgetRatio(fixture, artifact({ contextTokenBudget: 5200 }));
    expect(result.metric).toBe("context_token_budget_ratio");
    expect(result.status).toBe("info");
    expect(result.breakdown?.budget).toBe(5200);
    expect(result.score).toBeCloseTo(100 / 5200, 5);
  });

  it("falls back to the production default of 8000 for artifacts without a budget", () => {
    const result = contextTokenBudgetRatio(fixture, artifact());
    expect(result.breakdown?.budget).toBe(8000);
    expect(result.score).toBeCloseTo(100 / 8000, 5);
  });
});

describe("stageTokenShare", () => {
  it("is info when no spans", () => {
    const result = stageTokenShare(fixture, artifact());
    expect(result.status).toBe("info");
    expect(result.score).toBe(0);
  });

  it("reports the share of every stage present, keyed by stage", () => {
    const result = stageTokenShare(
      fixture,
      artifact({
        stageSpans: [
          { stage: "plan", latencyMs: 5, tokenUsage: { prompt: 30, completion: 10, total: 40 } },
          { stage: "hyde", latencyMs: 5, tokenUsage: { prompt: 20, completion: 0, total: 20 } },
          {
            stage: "generate",
            latencyMs: 5,
            tokenUsage: { prompt: 80, completion: 60, total: 140 },
          },
          { stage: "grounding", latencyMs: 5 },
        ],
      })
    );
    expect(result.breakdown?.plan).toBe(40);
    expect(result.breakdown?.total).toBe(200);
    expect(result.breakdown?.planShare).toBeCloseTo(40 / 200, 5);
    expect(result.breakdown?.hydeShare).toBeCloseTo(20 / 200, 5);
    expect(result.breakdown?.generateShare).toBeCloseTo(140 / 200, 5);
    expect(result.breakdown?.planHydeShare).toBeCloseTo(60 / 200, 5);
    // Latency-only stages carry no tokens, so they get no share.
    expect(result.breakdown).not.toHaveProperty("groundingShare");
  });

  it("scores the share of non-generate LLM tokens (overhead), not the generate share", () => {
    const result = stageTokenShare(
      fixture,
      artifact({
        stageSpans: [
          { stage: "plan", latencyMs: 5, tokenUsage: { prompt: 30, completion: 10, total: 40 } },
          {
            stage: "generate",
            latencyMs: 5,
            tokenUsage: { prompt: 80, completion: 60, total: 140 },
          },
        ],
      })
    );
    expect(result.score).toBeCloseTo(40 / 180, 5);
    expect(result.breakdown?.overheadShare).toBeCloseTo(40 / 180, 5);
    expect(result.status).toBe("info");
  });

  it("keeps the map share for studio spans", () => {
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
    // No generate span (studio): the score stays the map share.
    expect(result.score).toBeCloseTo(100 / 150, 5);
  });
});
