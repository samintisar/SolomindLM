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
});
