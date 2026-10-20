import { describe, expect, it } from "vitest";
import { createTurnTelemetry } from "./tokenUsageAccumulator";

/** A clock that reads the value the test sets, so span latencies are exact. */
function fakeClock(start: number) {
  let current = start;
  return {
    now: () => current,
    set: (value: number) => {
      current = value;
    },
  };
}

describe("createTurnTelemetry", () => {
  it("sums LLM usage and counts each LLM call", () => {
    const telemetry = createTurnTelemetry();
    telemetry.recordLlmCall("generate", Date.now(), {
      prompt: 10,
      completion: 5,
      total: 15,
      cachedPrompt: 4,
    });
    telemetry.recordLlmCall("hyde", Date.now(), { prompt: 20, completion: 8, total: 28 });
    telemetry.recordLlmCall("followup", Date.now(), undefined);

    const snapshot = telemetry.snapshot();
    expect(snapshot.tokenUsage).toEqual({ prompt: 30, completion: 13, total: 43, cachedPrompt: 4 });
    expect(snapshot.callCounters).toMatchObject({ llmCalls: 3 });
  });

  it("records one span per LLM call with its stage, latency and usage", () => {
    const clock = fakeClock(1000);
    const telemetry = createTurnTelemetry({ now: clock.now });

    clock.set(1250);
    telemetry.recordLlmCall("hyde", 1000, { prompt: 12, completion: 3, total: 15 });
    telemetry.recordLlmCall("followup", 1100);

    expect(telemetry.snapshot().stageSpans).toEqual([
      { stage: "hyde", latencyMs: 250, tokenUsage: { prompt: 12, completion: 3, total: 15 } },
      { stage: "followup", latencyMs: 150 },
    ]);
  });

  it("records latency-only stages without counting an LLM call", () => {
    const clock = fakeClock(500);
    const telemetry = createTurnTelemetry({ now: clock.now });

    clock.set(540);
    telemetry.recordStage("grounding", 500);

    const snapshot = telemetry.snapshot();
    expect(snapshot.stageSpans).toEqual([{ stage: "grounding", latencyMs: 40 }]);
    expect(snapshot.callCounters.llmCalls).toBe(0);
    expect(snapshot.tokenUsage).toBeUndefined();
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

  it("returns no usage, no spans and zero counters when nothing was recorded", () => {
    const snapshot = createTurnTelemetry().snapshot();
    expect(snapshot.tokenUsage).toBeUndefined();
    expect(snapshot.stageSpans).toEqual([]);
    expect(snapshot.callCounters.llmCalls).toBe(0);
  });

  it("resets after a snapshot so the next turn starts clean", () => {
    const telemetry = createTurnTelemetry();
    telemetry.recordLlmCall("plan", Date.now(), { prompt: 1, completion: 1, total: 2 });
    telemetry.recordEmbeddingCall();
    telemetry.snapshot();

    const next = telemetry.snapshot();
    expect(next.tokenUsage).toBeUndefined();
    expect(next.stageSpans).toEqual([]);
    expect(next.callCounters).toEqual({
      llmCalls: 0,
      embeddingCalls: 0,
      embeddingTexts: 0,
      rerankCalls: 0,
      rerankDocs: 0,
    });
  });
});
