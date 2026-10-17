import { describe, expect, it } from "vitest";
import { buildChatEvalTelemetry } from "./chatEvalTelemetry";

const estimated = { prompt: 100, completion: 50, total: 150 };

describe("buildChatEvalTelemetry", () => {
  it("prefers provider usage and records retrieve/rerank/select spans", () => {
    const result = buildChatEvalTelemetry({
      retrieveMs: 40,
      rerankMs: 25,
      selectMs: 10,
      provider: { prompt: 11, completion: 7, total: 18 },
      estimated,
    });

    expect(result.tokenUsage).toEqual({ prompt: 11, completion: 7, total: 18 });
    expect(result.tokenUsageSource).toBe("provider");
    expect(result.stageSpans).toEqual([
      { stage: "retrieve", latencyMs: 40 },
      { stage: "rerank", latencyMs: 25 },
      { stage: "select", latencyMs: 10 },
    ]);
  });

  it("falls back to estimated usage and omits missing stages", () => {
    const result = buildChatEvalTelemetry({
      retrieveMs: 12,
      estimated,
    });

    expect(result.tokenUsage).toEqual(estimated);
    expect(result.tokenUsageSource).toBe("estimated");
    expect(result.stageSpans).toEqual([{ stage: "retrieve", latencyMs: 12 }]);
  });

  it("passes call counters through unchanged", () => {
    const callCounters = {
      llmCalls: 4,
      embeddingCalls: 3,
      embeddingTexts: 3,
      rerankCalls: 1,
      rerankDocs: 20,
    };
    const result = buildChatEvalTelemetry({ estimated, callCounters });
    expect(result.callCounters).toEqual(callCounters);
  });

  it("omits callCounters when the agent did not report them", () => {
    const result = buildChatEvalTelemetry({ estimated });
    expect(result.callCounters).toBeUndefined();
  });

  it("merges agent spans with retrieve/rerank/select in stable stage order", () => {
    const result = buildChatEvalTelemetry({
      retrieveMs: 40,
      rerankMs: 25,
      selectMs: 10,
      estimated,
      agentSpans: [
        { stage: "followup", latencyMs: 9, tokenUsage: { prompt: 4, completion: 2, total: 6 } },
        {
          stage: "generate",
          latencyMs: 300,
          tokenUsage: { prompt: 90, completion: 30, total: 120 },
        },
        { stage: "hyde", latencyMs: 60, tokenUsage: { prompt: 20, completion: 5, total: 25 } },
        { stage: "grounding", latencyMs: 15 },
        { stage: "hyde", latencyMs: 55, tokenUsage: { prompt: 18, completion: 4, total: 22 } },
        { stage: "plan", latencyMs: 80, tokenUsage: { prompt: 50, completion: 10, total: 60 } },
      ],
    });

    expect(result.stageSpans.map((span) => span.stage)).toEqual([
      "retrieve",
      "plan",
      "hyde",
      "hyde",
      "rerank",
      "select",
      "generate",
      "grounding",
      "followup",
    ]);
    // Agent spans keep their own latency and usage; the two hyde spans keep their call order.
    expect(result.stageSpans.find((span) => span.stage === "generate")).toEqual({
      stage: "generate",
      latencyMs: 300,
      tokenUsage: { prompt: 90, completion: 30, total: 120 },
    });
    expect(result.stageSpans.filter((span) => span.stage === "hyde")).toEqual([
      { stage: "hyde", latencyMs: 60, tokenUsage: { prompt: 20, completion: 5, total: 25 } },
      { stage: "hyde", latencyMs: 55, tokenUsage: { prompt: 18, completion: 4, total: 22 } },
    ]);
  });

  it("keeps the retrieve/rerank/select spans as they were when the agent reports none", () => {
    const result = buildChatEvalTelemetry({
      retrieveMs: 40,
      rerankMs: 25,
      estimated,
      agentSpans: [],
    });
    expect(result.stageSpans).toEqual([
      { stage: "retrieve", latencyMs: 40 },
      { stage: "rerank", latencyMs: 25 },
    ]);
  });
});
