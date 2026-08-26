import { describe, expect, it } from "vitest";
import { createStageSpan } from "./stageSpans";

describe("createStageSpan", () => {
  it("computes latency from injected now", () => {
    const span = createStageSpan("retrieve", 1000, { now: () => 1250 });
    expect(span).toEqual({ stage: "retrieve", latencyMs: 250 });
  });

  it("clamps negative latency to 0", () => {
    const span = createStageSpan("map", 2000, { now: () => 1500 });
    expect(span).toEqual({ stage: "map", latencyMs: 0 });
  });

  it("omits tokenUsage when not provided", () => {
    const span = createStageSpan("retrieve", 1000, { now: () => 1100 });
    expect(span).not.toHaveProperty("tokenUsage");
  });

  it("includes tokenUsage when provided", () => {
    const tokenUsage = { prompt: 10, completion: 5, total: 15 };
    const span = createStageSpan("map", 1000, {
      now: () => 1100,
      tokenUsage,
    });
    expect(span).toEqual({ stage: "map", latencyMs: 100, tokenUsage });
  });
});
