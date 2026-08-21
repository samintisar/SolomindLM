import { afterEach, describe, expect, it } from "vitest";
import type { EvalFixture, EvalRunArtifact } from "../types";
import { evaluateInfographicWithVision } from "./visionJudge";

const fixture: EvalFixture = {
  schemaVersion: 1,
  id: "studio-infographic-agentic-patterns-20",
  runner: "infographic",
  question: "Make an infographic of the 20 patterns",
  notebookId: "nb",
  expectedItems: [],
  expectedBehavior: "Infographic of the patterns.",
  tags: ["infographic"],
};

const artifact: EvalRunArtifact = {
  caseId: fixture.id,
  runner: "infographic",
  configHash: "hash",
  answer: "",
  citations: [],
  preRerankChunks: [],
  postRerankChunks: [],
  selectedChunks: [],
  subQueries: [],
  latencyMs: 1,
  timestamp: "2026-08-20T00:00:00.000Z",
  studioOutput: {
    kind: "infographic",
    raw: { data: { imageUrl: "https://example.com/infographic.png" } },
  },
};

describe("evaluateInfographicWithVision", () => {
  afterEach(() => {
    delete process.env.EVAL_VISION_JUDGE;
  });

  it("skips with info when the vision model is not opted in", async () => {
    delete process.env.EVAL_VISION_JUDGE;
    const results = await evaluateInfographicWithVision(fixture, artifact);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.status === "info")).toBe(true);
    expect(results[0]?.metric).toBe("vision_judge");
    expect(results[0]?.detail.toLowerCase()).toMatch(/skip|disabled|not enabled/);
  });
});
