import { describe, expect, it } from "vitest";
import { createTurnTelemetry } from "./tokenUsageAccumulator";

describe("createTurnTelemetry", () => {
  it("sums LLM usage and counts each LLM call", () => {
    const telemetry = createTurnTelemetry();
    telemetry.recordLlmCall({ prompt: 10, completion: 5, total: 15, cachedPrompt: 4 });
    telemetry.recordLlmCall({ prompt: 20, completion: 8, total: 28 });
    telemetry.recordLlmCall(undefined);

    const snapshot = telemetry.snapshot();
    expect(snapshot.tokenUsage).toEqual({ prompt: 30, completion: 13, total: 43, cachedPrompt: 4 });
    expect(snapshot.callCounters).toMatchObject({ llmCalls: 3 });
  });

  it("counts embedding and rerank calls alongside LLM calls", () => {
    const telemetry = createTurnTelemetry();
    telemetry.recordEmbeddingCall();
    telemetry.recordEmbeddingCall(2);
    telemetry.recordRerankCall(14);

    expect(telemetry.snapshot().callCounters).toEqual({
      llmCalls: 0,
      embeddingCalls: 2,
      embeddingTexts: 3,
      rerankCalls: 1,
      rerankDocs: 14,
    });
  });

  it("returns undefined tokenUsage and zero counters when nothing was recorded", () => {
    const snapshot = createTurnTelemetry().snapshot();
    expect(snapshot.tokenUsage).toBeUndefined();
    expect(snapshot.callCounters.llmCalls).toBe(0);
  });

  it("resets after a snapshot so the next turn starts clean", () => {
    const telemetry = createTurnTelemetry();
    telemetry.recordLlmCall({ prompt: 1, completion: 1, total: 2 });
    telemetry.recordEmbeddingCall();
    telemetry.snapshot();

    const next = telemetry.snapshot();
    expect(next.tokenUsage).toBeUndefined();
    expect(next.callCounters).toEqual({
      llmCalls: 0,
      embeddingCalls: 0,
      embeddingTexts: 0,
      rerankCalls: 0,
      rerankDocs: 0,
    });
  });
});
