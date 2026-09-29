import { describe, expect, it } from "vitest";
import type { MetricResult } from "../types";
import { formatReport, generateReport } from "./reportGenerator";
import { buildScorecard, formatScorecard, isJudgeError } from "./scorecard";

function m(
  partial: Partial<MetricResult> & Pick<MetricResult, "metric" | "status" | "caseId">
): MetricResult {
  return {
    runner: "flashcards",
    configHash: "h",
    score: partial.status === "pass" ? 1 : 0,
    detail: "",
    ...partial,
  };
}

const useCaseByCase = new Map([
  ["language-learners/a", "language-learners"],
  ["language-learners/b", "language-learners"],
]);

const metrics: MetricResult[] = [
  m({ caseId: "language-learners/a", metric: "flashcard_card_validity", status: "pass" }),
  m({ caseId: "language-learners/a", metric: "rubric:language-learners:one-item", status: "fail" }),
  m({ caseId: "language-learners/b", metric: "rubric:language-learners:one-item", status: "fail" }),
  m({
    caseId: "language-learners/b",
    metric: "binary_judge_studio_grounding",
    status: "fail",
    breakdown: { error: "JSON Parse error" },
  }),
  m({ caseId: "language-learners/b", metric: "latency_cost_budget", status: "info" }),
  m({
    caseId: "language-learners/a",
    metric: "quiz_option_validity",
    status: "pass",
    runner: "quiz",
  }),
  m({ caseId: "ml-x", metric: "binary_judge_chat_grounding", status: "fail", runner: "chat" }),
];

describe("isJudgeError", () => {
  it("recognises binary-judge and rubric failures without a verdict", () => {
    expect(isJudgeError(metrics[3])).toBe(true);
    expect(
      isJudgeError(
        m({ caseId: "x", metric: "rubric:p:c", status: "fail", breakdown: { judgeError: true } })
      )
    ).toBe(true);
    expect(isJudgeError(metrics[1])).toBe(false);
    expect(
      isJudgeError(
        m({
          caseId: "x",
          metric: "expected_item_recall",
          status: "fail",
          breakdown: { error: "x" },
        })
      )
    ).toBe(false);
  });
});

describe("buildScorecard", () => {
  it("aggregates pass/fail per pack × runner, keeping judge errors apart", () => {
    expect(buildScorecard(metrics, useCaseByCase).cells).toEqual([
      {
        useCase: "language-learners",
        runner: "flashcards",
        pass: 1,
        fail: 2,
        judgeErrors: 1,
        passRate: 1 / 3,
        failedChecks: ["rubric:language-learners:one-item"],
      },
      {
        useCase: "language-learners",
        runner: "quiz",
        pass: 1,
        fail: 0,
        judgeErrors: 0,
        passRate: 1,
        failedChecks: [],
      },
    ]);
  });
});

describe("judge-error-only cells", () => {
  it("has a null pass rate and prints n/a (0/0)", () => {
    const scorecard = buildScorecard(
      [
        m({
          caseId: "language-learners/a",
          metric: "rubric:language-learners:one-item",
          status: "fail",
          breakdown: { judgeError: true },
        }),
      ],
      useCaseByCase
    );
    expect(scorecard.cells).toEqual([
      {
        useCase: "language-learners",
        runner: "flashcards",
        pass: 0,
        fail: 0,
        judgeErrors: 1,
        passRate: null,
        failedChecks: [],
      },
    ]);
    expect(formatScorecard(scorecard)).toContain("      flashcards  n/a (0/0)  judge errors: 1");
  });
});

describe("scorecard in reports", () => {
  it("formats cells and is attached and printed by the report", () => {
    const scorecard = buildScorecard(metrics, useCaseByCase);
    expect(formatScorecard(scorecard)).toEqual([
      "  Use-case scorecard:",
      "    language-learners",
      "      flashcards  33% (1/3)  judge errors: 1  failing: rubric:language-learners:one-item",
      "      quiz  100% (1/1)",
      "",
    ]);
    const report = generateReport(metrics, { commitSha: "abc12345", useCaseByCase });
    expect(report.scorecard?.cells).toHaveLength(2);
    expect(formatReport(report)).toContain("Use-case scorecard:");
  });

  it("omits the scorecard when no pack fixtures ran", () => {
    const report = generateReport(metrics, { commitSha: "abc12345" });
    expect(report.scorecard).toBeUndefined();
    expect(formatReport(report)).not.toContain("Use-case scorecard:");
  });
});
