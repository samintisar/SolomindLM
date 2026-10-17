import { describe, expect, it } from "vitest";
import type { EvalReport, MetricResult } from "../types";
import { checkHoldoutPromotion } from "./promotion";
import { buildScorecard } from "./scorecard";

function judge(caseId: string, status: MetricResult["status"]): MetricResult {
  return {
    metric: "binary_judge_chat_grounding",
    caseId,
    runner: "chat",
    configHash: "h",
    status,
    score: status === "pass" ? 1 : 0,
    detail: "d",
  };
}

function report(metrics: MetricResult[]): EvalReport {
  return {
    timestamp: "2026-10-17T00:00:00.000Z",
    commitSha: "abc",
    totalCases: 0,
    summary: { pass: 0, fail: 0, warn: 0, info: 0 },
    metrics,
    failureGroups: [],
  };
}

describe("scorecard and paraphrases", () => {
  it("does not count a paraphrase as another case in its pack", () => {
    const card = buildScorecard(
      [judge("pack/a", "pass"), judge("pack/a--p1", "fail"), judge("pack/a--p2", "fail")],
      new Map([
        ["pack/a", "pack"],
        ["pack/a--p1", "pack"],
        ["pack/a--p2", "pack"],
      ])
    );
    expect(card.cells[0]).toMatchObject({ pass: 1, fail: 0 });
  });
});

describe("holdout promotion and paraphrases", () => {
  it("ignores a paraphrase that regresses, since the base's paraphrase_consistency row carries it", () => {
    const before = report([judge("pack/a", "pass"), judge("pack/a--p1", "pass")]);
    const after = report([judge("pack/a", "pass"), judge("pack/a--p1", "fail")]);
    expect(checkHoldoutPromotion(before, after).ok).toBe(true);
  });

  it("still blocks when the base itself regresses", () => {
    const before = report([judge("pack/a", "pass")]);
    const after = report([judge("pack/a", "fail")]);
    expect(checkHoldoutPromotion(before, after).ok).toBe(false);
  });
});
