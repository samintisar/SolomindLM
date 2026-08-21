import { describe, expect, it } from "vitest";
import type { MetricResult } from "../types";
import { groupFailures } from "./failureGrouper";

function metric(
  partial: Partial<MetricResult> & Pick<MetricResult, "metric" | "status">
): MetricResult {
  return {
    caseId: "agentic-patterns-20",
    runner: "chat",
    configHash: "h",
    score: 0,
    detail: "fail",
    ...partial,
  };
}

describe("groupFailures taxonomy", () => {
  it("maps expected_item_recall to prompt_answering", () => {
    const groups = groupFailures(
      [metric({ metric: "expected_item_recall", status: "fail", score: 0.4 })],
      { includeWarnings: false }
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.category).toBe("prompt_answering");
  });

  it("maps chat grounding to prompt_answering when selected recall is high", () => {
    const groups = groupFailures(
      [
        metric({ metric: "binary_judge_chat_grounding", status: "fail", score: 0 }),
        metric({
          metric: "retrieval_item_recall_selected",
          status: "info",
          score: 0.9,
        }),
        metric({
          metric: "retrieval_item_recall_pre_rerank",
          status: "info",
          score: 0.95,
        }),
      ],
      { includeWarnings: false }
    );
    expect(groups[0]?.category).toBe("prompt_answering");
  });

  it("maps chat grounding to context_selection when items were retrieved then dropped", () => {
    const groups = groupFailures(
      [
        metric({ metric: "binary_judge_chat_grounding", status: "fail", score: 0 }),
        metric({
          metric: "retrieval_item_recall_selected",
          status: "info",
          score: 0.2,
        }),
        metric({
          metric: "retrieval_item_recall_pre_rerank",
          status: "info",
          score: 0.9,
        }),
      ],
      { includeWarnings: false }
    );
    expect(groups[0]?.category).toBe("context_selection");
  });

  it("maps chat grounding to retrieval when selected and pre-rerank recall are both low", () => {
    const groups = groupFailures(
      [
        metric({ metric: "binary_judge_chat_grounding", status: "fail", score: 0 }),
        metric({
          metric: "retrieval_item_recall_selected",
          status: "info",
          score: 0.1,
        }),
        metric({
          metric: "retrieval_item_recall_pre_rerank",
          status: "info",
          score: 0.2,
        }),
      ],
      { includeWarnings: false }
    );
    expect(groups[0]?.category).toBe("retrieval");
  });
});
