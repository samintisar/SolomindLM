import { describe, expect, it } from "vitest";
import type { EvalReport, MetricResult } from "../types";
import { checkHoldoutPromotion } from "./promotion";

function metric(
  partial: Partial<MetricResult> & Pick<MetricResult, "metric" | "status">
): MetricResult {
  return {
    caseId: "h1",
    runner: "chat",
    configHash: "x",
    score: 0,
    detail: "",
    ...partial,
  };
}

function report(metrics: MetricResult[]): EvalReport {
  return {
    timestamp: "2026-08-20T00:00:00.000Z",
    commitSha: "abc",
    totalCases: 1,
    split: "holdout",
    summary: { pass: 0, fail: 0, warn: 0, info: 0 },
    metrics,
    failureGroups: [],
  };
}

describe("checkHoldoutPromotion", () => {
  it("rejects a new grounding fail", () => {
    const before = report([metric({ metric: "binary_judge_chat_grounding", status: "pass" })]);
    const after = report([metric({ metric: "binary_judge_chat_grounding", status: "fail" })]);
    const decision = checkHoldoutPromotion(before, after);
    expect(decision.ok).toBe(false);
    expect(decision.regressions[0]?.metric).toBe("binary_judge_chat_grounding");
  });

  it("ignores expected_item_recall regressions", () => {
    const before = report([metric({ metric: "expected_item_recall", status: "pass" })]);
    const after = report([metric({ metric: "expected_item_recall", status: "fail" })]);
    expect(checkHoldoutPromotion(before, after).ok).toBe(true);
  });
});
