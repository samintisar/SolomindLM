import { describe, expect, it } from "vitest";
import { aggregateStudioJobTelemetry } from "./studioJobTelemetry";
import { fromProviderUsage } from "./usageAggregate";

describe("aggregateStudioJobTelemetry", () => {
  it("sums map and reduce provider usage into persisted telemetry", () => {
    const snapshot = aggregateStudioJobTelemetry({
      mapResults: [
        {
          processingTimeMs: 40,
          tokenUsage: { prompt: 10, completion: 4, total: 14 },
        },
        {
          processingTimeMs: 60,
          tokenUsage: { prompt: 20, completion: 6, total: 26 },
        },
      ],
      reduce: {
        latencyMs: 90,
        tokenUsage: { prompt: 30, completion: 50, total: 80 },
      },
    });

    expect(snapshot.tokenUsage).toEqual({ prompt: 60, completion: 60, total: 120 });
    expect(snapshot.tokenUsageSource).toBe("provider");
    expect(snapshot.stageSpans).toEqual([
      {
        stage: "map",
        latencyMs: 100,
        tokenUsage: { prompt: 30, completion: 10, total: 40 },
      },
      {
        stage: "reduce",
        latencyMs: 90,
        tokenUsage: { prompt: 30, completion: 50, total: 80 },
      },
    ]);
  });

  it("omits token usage when no provider counts were stored", () => {
    const snapshot = aggregateStudioJobTelemetry({
      mapResults: [{ processingTimeMs: 12, summary: "joined source" }],
      reduce: { latencyMs: 40 },
    });

    expect(snapshot.tokenUsage).toBeUndefined();
    expect(snapshot.tokenUsageSource).toBeUndefined();
    expect(snapshot.stageSpans).toEqual([
      { stage: "map", latencyMs: 12 },
      { stage: "reduce", latencyMs: 40 },
    ]);
  });

  it("parses tokenUsage out of JSON map-result strings", () => {
    const snapshot = aggregateStudioJobTelemetry({
      mapResults: [
        JSON.stringify({
          processingTimeMs: 15,
          tokenUsage: { prompt: 3, completion: 1, total: 4 },
        }),
      ],
    });

    expect(snapshot.tokenUsage).toEqual({ prompt: 3, completion: 1, total: 4 });
    expect(snapshot.tokenUsageSource).toBe("provider");
    expect(snapshot.stageSpans).toEqual([
      {
        stage: "map",
        latencyMs: 15,
        tokenUsage: { prompt: 3, completion: 1, total: 4 },
      },
    ]);
  });

  it("carries cachedPrompt from a reduce usage built from provider usage", () => {
    const snapshot = aggregateStudioJobTelemetry({
      reduce: {
        latencyMs: 5,
        tokenUsage: fromProviderUsage({
          promptTokens: 100,
          completionTokens: 10,
          totalTokens: 110,
          cachedPromptTokens: 70,
        }),
      },
    });
    expect(snapshot.tokenUsage).toEqual({
      prompt: 100,
      completion: 10,
      total: 110,
      cachedPrompt: 70,
    });
    expect(snapshot.stageSpans?.[0]).toEqual({
      stage: "reduce",
      latencyMs: 5,
      tokenUsage: { prompt: 100, completion: 10, total: 110, cachedPrompt: 70 },
    });
  });

  it("keeps cachedPrompt on map results and omits it when no provider reported it", () => {
    const snapshot = aggregateStudioJobTelemetry({
      mapResults: [
        JSON.stringify({
          processingTimeMs: 3,
          tokenUsage: { prompt: 8, completion: 2, total: 10, cachedPrompt: 5 },
        }),
        { processingTimeMs: 4, tokenUsage: { prompt: 6, completion: 1, total: 7 } },
      ],
    });
    expect(snapshot.tokenUsage).toEqual({ prompt: 14, completion: 3, total: 17, cachedPrompt: 5 });
    expect(snapshot.tokenUsage).toBeDefined();
    const withoutCache = aggregateStudioJobTelemetry({
      reduce: { latencyMs: 1, tokenUsage: { prompt: 1, completion: 1, total: 2 } },
    });
    expect(withoutCache.tokenUsage).not.toHaveProperty("cachedPrompt");
  });
});
