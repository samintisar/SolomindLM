import { describe, expect, it } from "vitest";
import type { EvalFixture } from "../types";
import { snapshotRetrievalConfig } from "./config";
import type { StudioInvoker } from "./convexStudioInvoker";
import { runStudioEval } from "./studioRunner";

const fixture: EvalFixture = {
  schemaVersion: 1,
  id: "s",
  runner: "report",
  question: "q",
  notebookId: "nb",
  expectedItems: ["item"],
  expectedBehavior: "b",
  tags: [],
};

describe("runStudioEval tokenUsageSource", () => {
  it("defaults to estimated when the invoker omits the field", async () => {
    const invoker: StudioInvoker = {
      kind: "report",
      invoke: async () => ({
        raw: { title: "T", content: "body" },
        latencyMs: 12,
        tokenUsage: { prompt: 1, completion: 2, total: 3 },
      }),
    };

    const { artifact, errors } = await runStudioEval(
      { fixture, config: snapshotRetrievalConfig(), kind: "report" },
      invoker
    );

    expect(errors).toEqual([]);
    expect(artifact.tokenUsageSource).toBe("estimated");
  });

  it("copies provider token usage source and stage spans from the invoker", async () => {
    const invoker: StudioInvoker = {
      kind: "report",
      invoke: async () => ({
        raw: { title: "T", content: "body" },
        latencyMs: 12,
        tokenUsage: { prompt: 1, completion: 2, total: 3 },
        tokenUsageSource: "provider",
        stageSpans: [
          { stage: "retrieve", latencyMs: 20 },
          { stage: "reduce", latencyMs: 40 },
        ],
      }),
    };

    const { artifact, errors } = await runStudioEval(
      { fixture, config: snapshotRetrievalConfig(), kind: "report" },
      invoker
    );

    expect(errors).toEqual([]);
    expect(artifact.tokenUsageSource).toBe("provider");
    expect(artifact.stageSpans).toEqual([
      { stage: "retrieve", latencyMs: 20 },
      { stage: "reduce", latencyMs: 40 },
    ]);
  });
});
