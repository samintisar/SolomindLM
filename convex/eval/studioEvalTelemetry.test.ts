import { describe, expect, it } from "vitest";
import { pickStudioEvalTelemetry } from "./studioEvalTelemetry";

describe("pickStudioEvalTelemetry", () => {
  it("omits all fields for an empty row", () => {
    expect(pickStudioEvalTelemetry({})).toEqual({});
  });

  it("copies top-level telemetry fields", () => {
    expect(
      pickStudioEvalTelemetry({
        tokenUsage: { prompt: 10, completion: 5, total: 15 },
        tokenUsageSource: "provider",
        stageSpans: [
          { stage: "retrieve", latencyMs: 20 },
          {
            stage: "map",
            latencyMs: 30,
            tokenUsage: { prompt: 4, completion: 6, total: 10 },
          },
        ],
      })
    ).toEqual({
      tokenUsage: { prompt: 10, completion: 5, total: 15 },
      tokenUsageSource: "provider",
      stageSpans: [
        { stage: "retrieve", latencyMs: 20 },
        {
          stage: "map",
          latencyMs: 30,
          tokenUsage: { prompt: 4, completion: 6, total: 10 },
        },
      ],
    });
  });

  it("copies metadata telemetry fields when top-level fields are absent", () => {
    expect(
      pickStudioEvalTelemetry({
        metadata: {
          tokenUsage: { prompt: 2, completion: 3, total: 5 },
          tokenUsageSource: "estimated",
          stageSpans: [{ stage: "reduce", latencyMs: 44 }],
        },
      })
    ).toEqual({
      tokenUsage: { prompt: 2, completion: 3, total: 5 },
      tokenUsageSource: "estimated",
      stageSpans: [{ stage: "reduce", latencyMs: 44 }],
    });
  });

  it("drops unknown stage names", () => {
    expect(
      pickStudioEvalTelemetry({
        metadata: {
          stageSpans: [
            { stage: "retrieve", latencyMs: 20 },
            { stage: "unknown", latencyMs: 99 },
          ],
        },
      })
    ).toEqual({
      stageSpans: [{ stage: "retrieve", latencyMs: 20 }],
    });
  });

  it("does not default missing tokenUsageSource", () => {
    expect(
      pickStudioEvalTelemetry({
        tokenUsage: { prompt: 7, completion: 8, total: 15 },
      })
    ).toEqual({
      tokenUsage: { prompt: 7, completion: 8, total: 15 },
    });
  });
});
