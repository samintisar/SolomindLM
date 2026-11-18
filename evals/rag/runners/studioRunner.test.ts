import { afterEach, describe, expect, it } from "vitest";
import type { EvalFixture } from "../types";
import { snapshotRetrievalConfig } from "./config";
import { runStudioEval } from "./studioRunner";

const infographicFixture: EvalFixture = {
  schemaVersion: 1,
  id: "studio-infographic-agentic-patterns-20",
  runner: "infographic",
  question: "Create an infographic",
  notebookId: "nb",
  expectedItems: ["a"],
  expectedBehavior: "Infographic",
  tags: ["infographic"],
};

describe("runStudioEval infographic image generation", () => {
  afterEach(() => {
    delete process.env.EVAL_VISION_JUDGE;
  });

  it("does not invoke the infographic agent when EVAL_VISION_JUDGE is unset", async () => {
    delete process.env.EVAL_VISION_JUDGE;
    let called = 0;
    const result = await runStudioEval(
      {
        fixture: infographicFixture,
        config: snapshotRetrievalConfig(),
        dryRun: false,
        kind: "infographic",
      },
      {
        kind: "infographic",
        invoke: async () => {
          called += 1;
          return { raw: { data: { imageUrl: "https://example.com/x.png" } }, latencyMs: 1 };
        },
      }
    );
    expect(called).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.artifact.studioOutput?.raw).toMatchObject({ skippedImageGeneration: true });
  });

  it("invokes the infographic agent when EVAL_VISION_JUDGE is enabled", async () => {
    process.env.EVAL_VISION_JUDGE = "true";
    let called = 0;
    const result = await runStudioEval(
      {
        fixture: infographicFixture,
        config: snapshotRetrievalConfig(),
        dryRun: false,
        kind: "infographic",
      },
      {
        kind: "infographic",
        invoke: async () => {
          called += 1;
          return { raw: { data: { imageUrl: "https://example.com/x.png" } }, latencyMs: 12 };
        },
      }
    );
    expect(called).toBe(1);
    expect(result.artifact.latencyMs).toBe(12);
  });
});
