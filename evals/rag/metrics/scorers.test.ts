import { describe, expect, it } from "vitest";
import type { EvalFixture, EvalRunArtifact } from "../types";
import { scoreAllMetrics } from "./scorers";

function fixtureFor(runner: EvalFixture["runner"], id = `${runner}-route-test`): EvalFixture {
  return {
    schemaVersion: 1,
    id,
    runner,
    question: "What is a decision stump?",
    notebookId: "nb",
    expectedItems: ["decision stump"],
    expectedBehavior: "Define the term from the notebook.",
    tags: [runner],
    ...(runner === "research"
      ? { sourcePolicy: { channels: ["web", "academic"], maxResultsPerChannel: 8 } }
      : {}),
  };
}

function artifactFor(runner: EvalRunArtifact["runner"]): EvalRunArtifact {
  return {
    caseId: `${runner}-route-test`,
    runner,
    configHash: "hash",
    answer: "A decision stump is a depth-1 tree.",
    citations: [],
    preRerankChunks: [],
    postRerankChunks: [],
    selectedChunks: [],
    subQueries: [],
    latencyMs: 10,
    timestamp: "2026-08-20T00:00:00.000Z",
    ...(runner === "research"
      ? { sourcePolicy: { channels: ["web", "academic"], maxResultsPerChannel: 8 } }
      : {}),
  };
}

describe("scoreAllMetrics routing", () => {
  it("runs chat retrieval probes and not literature-review metrics", async () => {
    const names = (
      await scoreAllMetrics(fixtureFor("chat"), artifactFor("chat"), undefined, {
        dryRun: true,
      })
    ).map((m) => m.metric);
    expect(names).toContain("expected_item_recall");
    expect(names).toContain("retrieval_precision_at_k");
    expect(names).toContain("abstention_correctness");
    expect(names).toContain("citation_validity");
    expect(names).not.toContain("lr_search_yield");
    expect(names).not.toContain("research_source_breadth");
  });

  it("runs research source metrics and not chat retrieval probes", async () => {
    const names = (
      await scoreAllMetrics(fixtureFor("research"), artifactFor("research"), undefined, {
        dryRun: true,
      })
    ).map((m) => m.metric);
    expect(names).toContain("citation_validity");
    expect(names).toContain("source_diversity");
    expect(names).toContain("research_source_breadth");
    expect(names).not.toContain("retrieval_precision_at_k");
    expect(names).not.toContain("lr_search_yield");
  });

  it("runs literature-review stage metrics for LR artifacts", async () => {
    const names = (
      await scoreAllMetrics(
        fixtureFor("literatureReview"),
        artifactFor("literatureReview"),
        undefined,
        { dryRun: true }
      )
    ).map((m) => m.metric);
    expect(names).toContain("lr_search_yield");
    expect(names).toContain("lr_prisma_consistency");
    expect(names).not.toContain("retrieval_precision_at_k");
    expect(names).not.toContain("research_source_breadth");
  });
});
