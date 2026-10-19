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
  it("marks usage estimated when the invoker reports usage without a source", async () => {
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
    expect(artifact.tokenUsage).toEqual({ prompt: 1, completion: 2, total: 3 });
  });

  it("leaves tokenUsageSource unset when there is no usage at all", async () => {
    const invoker: StudioInvoker = {
      kind: "report",
      invoke: async () => ({ raw: { title: "T", content: "body" }, latencyMs: 12 }),
    };

    const { artifact } = await runStudioEval(
      { fixture, config: snapshotRetrievalConfig(), kind: "report" },
      invoker
    );

    expect(artifact.tokenUsage).toBeUndefined();
    expect(artifact.tokenUsageSource).toBeUndefined();
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

describe("runStudioEval quiz serialization", () => {
  it("shows the judge the correct option text, not the bare answer index", async () => {
    const invoker: StudioInvoker = {
      kind: "quiz",
      invoke: async () => ({
        raw: {
          questions: [
            { question: "Which is prime?", options: ["4", "6", "7", "9"], answer: 2 },
            { question: "Legacy shape", options: ["x", "y"], correctAnswer: "y" },
          ],
        },
        latencyMs: 5,
      }),
    };

    const { artifact } = await runStudioEval(
      { fixture: { ...fixture, runner: "quiz" }, config: snapshotRetrievalConfig(), kind: "quiz" },
      invoker
    );

    expect(artifact.answer).toContain("Q1: Which is prime?");
    expect(artifact.answer).toContain("A: 7");
    expect(artifact.answer).not.toMatch(/A: 2\b/);
    expect(artifact.answer).toContain("A: y");
  });
});
