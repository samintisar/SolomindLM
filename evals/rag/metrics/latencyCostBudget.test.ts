import { describe, expect, it } from "vitest";
import type { EvalFixture, EvalRunArtifact } from "../types";
import { latencyCostBudget } from "./index";

function fixtureFor(runner: EvalFixture["runner"]): EvalFixture {
  return {
    schemaVersion: 1,
    id: `${runner}-latency-test`,
    runner,
    question: "Q?",
    notebookId: "nb",
    expectedItems: [],
    expectedBehavior: "test",
    tags: [runner],
  };
}

function artifactFor(runner: EvalRunArtifact["runner"], latencyMs: number): EvalRunArtifact {
  return {
    caseId: `${runner}-latency-test`,
    runner,
    configHash: "hash",
    answer: "ok",
    citations: [],
    preRerankChunks: [],
    postRerankChunks: [],
    selectedChunks: [],
    subQueries: [],
    latencyMs,
    timestamp: "2026-08-20T00:00:00.000Z",
    tokenUsage: { prompt: 100, completion: 100, total: 200 },
  };
}

describe("latencyCostBudget static gates", () => {
  it("passes a healthy literature-review run without a baseline", () => {
    const result = latencyCostBudget(
      fixtureFor("literatureReview"),
      artifactFor("literatureReview", 161_810)
    );
    expect(result.status).toBe("pass");
    expect(result.breakdown?.latencyGate).toBeGreaterThanOrEqual(161_810);
  });

  it("passes a healthy audioScriptOnly run without a baseline", () => {
    const result = latencyCostBudget(
      fixtureFor("audioScriptOnly"),
      artifactFor("audioScriptOnly", 187_840)
    );
    expect(result.status).toBe("pass");
    expect(result.breakdown?.latencyGate).toBeGreaterThanOrEqual(187_840);
  });

  it("passes a healthy research run around three minutes without a baseline", () => {
    const result = latencyCostBudget(fixtureFor("research"), artifactFor("research", 191_730));
    expect(result.status).toBe("pass");
    expect(result.breakdown?.latencyGate).toBeGreaterThanOrEqual(191_730);
  });
});
