import { describe, expect, it } from "vitest";
import type { MetricResult } from "../types";
import { generateReport } from "./reportGenerator";

function row(caseId: string, metric: string, status: MetricResult["status"]): MetricResult {
  return {
    metric,
    caseId,
    runner: "chat",
    configHash: "h",
    status,
    score: status === "pass" ? 1 : 0,
    detail: "d",
  };
}

describe("generateReport paraphrase consistency", () => {
  it("adds a paraphrase_consistency row per base case with paraphrases", () => {
    const report = generateReport(
      [
        row("a/x", "expected_item_recall", "pass"),
        row("a/x--p1", "expected_item_recall", "pass"),
        row("a/x--p2", "expected_item_recall", "pass"),
      ],
      { commitSha: "abc" }
    );
    const consistency = report.metrics.filter((m) => m.metric === "paraphrase_consistency");
    expect(consistency.map((m) => [m.caseId, m.status, m.score])).toEqual([["a/x", "pass", 1]]);
    expect(report.summary.pass).toBeGreaterThanOrEqual(3);
  });

  it("groups an inconsistent paraphrase under prompt_answering", () => {
    const report = generateReport(
      [
        row("a/x", "expected_item_recall", "pass"),
        row("a/x--p1", "expected_item_recall", "fail"),
        row("a/x--p2", "expected_item_recall", "fail"),
      ],
      { commitSha: "abc" }
    );
    const group = report.failureGroups.find((g) => g.category === "prompt_answering");
    expect(group?.cases.map((c) => c.caseId)).toContain("a/x");
    expect(report.failureGroups.flatMap((g) => g.cases.flatMap((c) => c.failures))).toEqual(
      expect.arrayContaining([expect.objectContaining({ metric: "paraphrase_consistency" })])
    );
  });

  it("does not add a row when no case has paraphrases", () => {
    const report = generateReport([row("a/x", "expected_item_recall", "pass")], {
      commitSha: "abc",
    });
    expect(report.metrics.some((m) => m.metric === "paraphrase_consistency")).toBe(false);
  });
});
