import { describe, expect, it } from "vitest";
import type { EvalBaseline, EvalFixture, EvalRunArtifact } from "../types";
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

const chatFixture: EvalFixture = { ...literatureReviewFixture, id: "chat", runner: "chat" };

const baseline: EvalBaseline = {
  caseId: "chat",
  runner: "chat",
  configHash: "h",
  latencyMs: 1000,
  tokenUsage: { prompt: 500, completion: 500, total: 1000 },
  committedAt: "2026-10-01T00:00:00.000Z",
};

describe("latencyCostBudget", () => {
  it("reports but does not gate provider tokens with no baseline and no history", () => {
    const result = latencyCostBudget(
      chatFixture,
      artifact({
        runner: "chat",
        latencyMs: 1000,
        tokenUsage: { prompt: 24000, completion: 1500, total: 25500 },
        tokenUsageSource: "provider",
      })
    );
    expect(result.status).toBe("pass");
    expect(result.detail).toMatch(/tokens 25500 \(no token history yet, not gated\)$/);
    expect(result.breakdown).toMatchObject({ tokensGated: false });
  });

  it.each([
    [14_000, "pass"],
    [18_000, "warn"],
    [25_000, "fail"],
  ] as const)("gates %i tokens against a 10000-token case median as %s", (total, status) => {
    const result = latencyCostBudget(
      chatFixture,
      artifact({
        runner: "chat",
        latencyMs: 1000,
        tokenUsage: { prompt: total, completion: 0, total },
        tokenUsageSource: "provider",
      }),
      undefined,
      10_000
    );
    expect(result.status).toBe(status);
    expect(result.breakdown).toMatchObject({ tokensGated: true, tokenReference: "case median" });
    expect(result.detail).toContain("case median 10000");
  });

  it("uses the case history when the baseline recorded no tokens", () => {
    const result = latencyCostBudget(
      chatFixture,
      artifact({
        runner: "chat",
        latencyMs: 1000,
        tokenUsage: { prompt: 30_000, completion: 0, total: 30_000 },
        tokenUsageSource: "provider",
      }),
      { ...baseline, tokenUsage: { prompt: 0, completion: 0, total: 0 } },
      10_000
    );
    expect(result.status).toBe("fail");
    expect(result.breakdown).toMatchObject({ tokenReference: "case median", tokenRatio: 3 });
  });

  it("prefers a baseline with tokens over the case history", () => {
    const result = latencyCostBudget(
      chatFixture,
      artifact({
        runner: "chat",
        latencyMs: 1000,
        tokenUsage: { prompt: 1000, completion: 0, total: 1000 },
        tokenUsageSource: "provider",
      }),
      baseline,
      100
    );
    expect(result.status).toBe("pass");
    expect(result.breakdown).toMatchObject({ tokenReference: "baseline", tokenRatio: 1 });
  });

  it("fails on latency alone even when tokens are fine", () => {
    const result = latencyCostBudget(
      chatFixture,
      artifact({
        runner: "chat",
        latencyMs: 130_000,
        tokenUsage: { prompt: 100, completion: 0, total: 100 },
        tokenUsageSource: "provider",
      }),
      undefined,
      100
    );
    expect(result.status).toBe("fail");
  });

  it("does not gate estimated token usage against a baseline", () => {
    const result = latencyCostBudget(
      chatFixture,
      artifact({
        runner: "chat",
        latencyMs: 1000,
        tokenUsage: { prompt: 5000, completion: 5000, total: 10000 },
        tokenUsageSource: "estimated",
      }),
      baseline
    );
    expect(result.status).toBe("pass");
    expect(result.detail).toMatch(/tokens 10000 \(estimated, not gated\)$/);
    expect(result.breakdown).toMatchObject({ tokensGated: false });
  });

  it("does not gate estimated token usage without a baseline", () => {
    const result = latencyCostBudget(
      chatFixture,
      artifact({
        runner: "chat",
        latencyMs: 1000,
        tokenUsage: { prompt: 50000, completion: 0, total: 50000 },
        tokenUsageSource: "estimated",
      })
    );
    expect(result.status).toBe("pass");
    expect(result.detail).toMatch(/tokens 50000 \(estimated, not gated\)$/);
    expect(result.breakdown).toMatchObject({ tokensGated: false });
  });

  it("still fails provider token usage that is far over the baseline", () => {
    const result = latencyCostBudget(
      chatFixture,
      artifact({
        runner: "chat",
        latencyMs: 1000,
        tokenUsage: { prompt: 2500, completion: 500, total: 3000 },
        tokenUsageSource: "provider",
      }),
      baseline
    );
    expect(result.status).toBe("fail");
    expect(result.breakdown).toMatchObject({ tokensGated: true });
  });

  it("ignores the token ratio when the baseline has no token usage", () => {
    const result = latencyCostBudget(
      chatFixture,
      artifact({
        runner: "chat",
        latencyMs: 1000,
        tokenUsage: { prompt: 5000, completion: 5000, total: 10000 },
        tokenUsageSource: "provider",
      }),
      { ...baseline, tokenUsage: { prompt: 0, completion: 0, total: 0 } }
    );
    expect(result.status).toBe("pass");
    expect(result.detail).toMatch(/tokens 10000 \(no token history yet, not gated\)$/);
    expect(result.breakdown).toMatchObject({ tokensGated: false });
    expect(result.breakdown).not.toHaveProperty("tokenRatio");
  });

  it("reports tokenRatio only when tokens are gated", () => {
    const gated = latencyCostBudget(
      chatFixture,
      artifact({
        runner: "chat",
        latencyMs: 1000,
        tokenUsage: { prompt: 500, completion: 500, total: 1000 },
        tokenUsageSource: "provider",
      }),
      baseline
    );
    expect(gated.breakdown).toMatchObject({ tokensGated: true, tokenRatio: 1 });

    const estimated = latencyCostBudget(
      chatFixture,
      artifact({
        runner: "chat",
        latencyMs: 1000,
        tokenUsage: { prompt: 500, completion: 500, total: 1000 },
        tokenUsageSource: "estimated",
      }),
      baseline
    );
    expect(estimated.breakdown).not.toHaveProperty("tokenRatio");
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
