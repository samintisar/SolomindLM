import { describe, expect, it } from "vitest";
import type { MetricResult } from "../types";
import { buildJudgeCalibrationQueue } from "./judgeQueue";

function metric(
  partial: Partial<MetricResult> & Pick<MetricResult, "metric" | "status">
): MetricResult {
  return {
    caseId: "c1",
    runner: "chat",
    configHash: "h",
    score: partial.status === "pass" ? 1 : 0,
    detail: `${partial.metric} ${partial.status}`,
    ...partial,
  };
}

describe("buildJudgeCalibrationQueue", () => {
  it("samples up to 20 binary-judge rows and ignores deterministic metrics", () => {
    const metrics: MetricResult[] = [
      metric({ metric: "expected_item_recall", status: "fail" }),
      ...Array.from({ length: 12 }, (_, i) =>
        metric({
          metric: "binary_judge_chat_grounding",
          status: i % 2 === 0 ? "pass" : "fail",
          caseId: `chat-${i}`,
        })
      ),
      ...Array.from({ length: 12 }, (_, i) =>
        metric({
          metric: "binary_judge_studio_structure",
          status: i % 3 === 0 ? "fail" : "pass",
          caseId: `studio-${i}`,
          runner: "report",
        })
      ),
    ];
    const queue = buildJudgeCalibrationQueue(metrics, { limit: 20 });
    expect(queue).toHaveLength(20);
    expect(queue.every((row) => row.metric.startsWith("binary_judge_"))).toBe(true);
    expect(queue.some((row) => row.modelStatus === "pass")).toBe(true);
    expect(queue.some((row) => row.modelStatus === "fail")).toBe(true);
    expect(queue.every((row) => row.humanAgree === null)).toBe(true);
  });
});
