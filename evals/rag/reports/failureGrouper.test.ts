import { describe, expect, it } from "vitest";
import type { MetricResult } from "../types";
import { groupFailures } from "./failureGrouper";

function failing(metric: string, breakdown?: Record<string, unknown>): MetricResult {
  return {
    metric,
    caseId: "wiring/unanswerable-01",
    runner: "chat",
    configHash: "h",
    status: "fail",
    score: 0,
    detail: "d",
    ...(breakdown ? { breakdown } : {}),
  };
}

describe("groupFailures on unanswerable fixtures", () => {
  it("groups hallucination_under_pressure under prompt_answering", () => {
    const groups = groupFailures([
      failing("abstention_correctness", { category: "hallucination_under_pressure" }),
    ]);
    expect(groups.map((g) => g.category)).toEqual(["prompt_answering"]);
  });

  it("groups the abstention judge under prompt_answering, not context_selection", () => {
    const groups = groupFailures([failing("binary_judge_abstention")]);
    expect(groups.map((g) => g.category)).toEqual(["prompt_answering"]);
  });
});
