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

const GROUNDING = "binary_judge_chat_grounding";
const flakyWarn = () =>
  metric({
    metric: GROUNDING,
    status: "warn",
    breakdown: { flaky: true, statuses: ["pass", "fail", "pass"] },
  });
const flakyMajorityFail = () =>
  metric({
    metric: GROUNDING,
    status: "fail",
    breakdown: { flaky: true, statuses: ["fail", "fail", "pass"] },
  });

describe("checkHoldoutPromotion", () => {
  it("rejects a new grounding fail", () => {
    const before = report([metric({ metric: GROUNDING, status: "pass" })]);
    const after = report([metric({ metric: GROUNDING, status: "fail" })]);
    const decision = checkHoldoutPromotion(before, after);
    expect(decision.ok).toBe(false);
    expect(decision.regressions[0]?.metric).toBe(GROUNDING);
  });

  it("never blocks on a flaky minority warning on the after side", () => {
    const before = report([metric({ metric: GROUNDING, status: "pass" })]);
    const after = report([flakyWarn()]);
    expect(checkHoldoutPromotion(before, after).ok).toBe(true);
  });

  it("a majority-fail flaky row on the after side is a regression against a pass", () => {
    const before = report([metric({ metric: GROUNDING, status: "pass" })]);
    const after = report([flakyMajorityFail()]);
    const decision = checkHoldoutPromotion(before, after);
    expect(decision.ok).toBe(false);
    expect(decision.regressions[0]).toMatchObject({ before: "pass", after: "fail" });
  });

  it("a fail against a flaky warn before is a regression, reported as before warn", () => {
    const before = report([flakyWarn()]);
    const after = report([metric({ metric: GROUNDING, status: "fail" })]);
    const decision = checkHoldoutPromotion(before, after);
    expect(decision.ok).toBe(false);
    expect(decision.regressions[0]).toMatchObject({ before: "warn", after: "fail" });
  });

  it("ignores expected_item_recall regressions", () => {
    const before = report([metric({ metric: "expected_item_recall", status: "pass" })]);
    const after = report([metric({ metric: "expected_item_recall", status: "fail" })]);
    expect(checkHoldoutPromotion(before, after).ok).toBe(true);
  });
});
