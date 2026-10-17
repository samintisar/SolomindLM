import { describe, expect, it } from "vitest";
import type { FailureCategory, MetricResult } from "../types";
import { groupFailures } from "./failureGrouper";

function fail(metric: string, score = 0, breakdown?: Record<string, unknown>): MetricResult {
  return {
    metric,
    caseId: "case-1",
    runner: "chat",
    configHash: "h",
    status: "fail",
    score,
    detail: "d",
    ...(breakdown ? { breakdown } : {}),
  };
}

function categoryOf(metric: MetricResult): FailureCategory {
  const groups = groupFailures([metric]);
  expect(groups).toHaveLength(1);
  return groups[0].category;
}

describe("groupFailures: passage metrics", () => {
  it("routes pre- and post-rerank passage recall misses to retrieval", () => {
    expect(categoryOf(fail("passage_recall_pre_rerank", 0.4))).toBe("retrieval");
    expect(categoryOf(fail("passage_recall_post_rerank", 0.4))).toBe("retrieval");
  });

  it("routes a selected-stage miss to context selection when an earlier stage held more", () => {
    const metric = fail("passage_recall_selected", 0.4, {
      preRerankRecall: 0.8,
      postRerankRecall: 0.6,
    });
    expect(categoryOf(metric)).toBe("context_selection");
  });

  it("routes a selected-stage miss to retrieval when no earlier stage held more", () => {
    const metric = fail("passage_recall_selected", 0.4, {
      preRerankRecall: 0.4,
      postRerankRecall: 0.4,
    });
    expect(categoryOf(metric)).toBe("retrieval");
  });

  it("routes passage precision and nDCG to context selection", () => {
    expect(categoryOf(fail("passage_precision_selected", 0.1))).toBe("context_selection");
    expect(categoryOf(fail("passage_ndcg_selected", 0.2))).toBe("context_selection");
  });

  it("groups passage failures of one case together with their trace hints", () => {
    const groups = groupFailures([
      fail("passage_precision_selected", 0.1),
      fail("passage_ndcg_selected", 0.2),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].cases[0].failures).toHaveLength(2);
    expect(groups[0].cases[0].traceHints?.[0]).toMatch(/^passage_precision_selected: /);
  });
});
