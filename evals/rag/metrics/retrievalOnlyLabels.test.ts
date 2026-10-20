import { describe, expect, it } from "vitest";
import { formatReport, generateReport } from "../reports/reportGenerator";
import type { EvalBaseline, EvalFixture, EvalRunArtifact } from "../types";
import { latencyCostBudget } from "./index";

const fixture: EvalFixture = {
  schemaVersion: 1,
  id: "label-case",
  runner: "chat",
  question: "q",
  notebookId: "nb",
  expectedItems: [],
  expectedBehavior: "b",
  tags: [],
};

const baseline: EvalBaseline = {
  caseId: "label-case",
  runner: "chat",
  configHash: "h",
  latencyMs: 20000,
  tokenUsage: { prompt: 100, completion: 50, total: 150 },
  committedAt: "2026-10-01T00:00:00.000Z",
};

const artifact = (partial: Partial<EvalRunArtifact> = {}): EvalRunArtifact => ({
  caseId: "label-case",
  runner: "chat",
  configHash: "h",
  answer: "",
  citations: [],
  preRerankChunks: [],
  postRerankChunks: [],
  selectedChunks: [],
  subQueries: [],
  latencyMs: 900,
  timestamp: "2026-10-17T00:00:00.000Z",
  ...partial,
});

describe("latencyCostBudget on a retrieval-only run", () => {
  it("is info and not compared to a full-run baseline, even though the run is far faster", () => {
    const row = latencyCostBudget(fixture, artifact({ retrievalOnly: true }), baseline);
    expect(row).toMatchObject({ metric: "latency_cost_budget", status: "info" });
    expect(row.detail).toBe("retrieval-only: not compared to a full-run baseline");
  });

  it("still compares a full run against the baseline (control)", () => {
    const row = latencyCostBudget(fixture, artifact(), baseline);
    expect(row.status).toBe("pass");
    expect(row.detail).not.toMatch(/retrieval-only/);
  });
});

describe("report labelling for retrieval-only runs", () => {
  it("marks the report and prints the banner only when asked", () => {
    const labelled = generateReport([], { commitSha: "abc", retrievalOnly: true });
    expect(labelled.retrievalOnly).toBe(true);
    expect(formatReport(labelled)).toContain("RETRIEVAL-ONLY RUN (answers not generated)");

    const plain = generateReport([], { commitSha: "abc" });
    expect(plain.retrievalOnly).toBeUndefined();
    expect(formatReport(plain)).not.toContain("RETRIEVAL-ONLY RUN");
  });
});
