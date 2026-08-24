import { describe, expect, it } from "vitest";
import { pickStudioInvokeTelemetry } from "./convexStudioInvoker";

describe("pickStudioInvokeTelemetry", () => {
  it("copies token usage, token usage source, and stage spans when present", () => {
    expect(
      pickStudioInvokeTelemetry({
        status: "completed",
        tokenUsage: { prompt: 11, completion: 7, total: 18 },
        tokenUsageSource: "provider",
        stageSpans: [
          { stage: "retrieve", latencyMs: 20 },
          { stage: "reduce", latencyMs: 40 },
        ],
      })
    ).toEqual({
      tokenUsage: { prompt: 11, completion: 7, total: 18 },
      tokenUsageSource: "provider",
      stageSpans: [
        { stage: "retrieve", latencyMs: 20 },
        { stage: "reduce", latencyMs: 40 },
      ],
    });
  });

  it("omits telemetry fields when the status does not include them", () => {
    expect(pickStudioInvokeTelemetry({ status: "completed", title: "T" })).toEqual({});
  });
});
