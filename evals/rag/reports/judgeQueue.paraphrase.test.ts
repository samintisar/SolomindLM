import { describe, expect, it } from "vitest";
import type { MetricResult } from "../types";
import { buildJudgeCalibrationQueue } from "./judgeQueue";

function judge(caseId: string, status: MetricResult["status"]): MetricResult {
  return {
    metric: "binary_judge_chat_grounding",
    caseId,
    runner: "chat",
    configHash: "h",
    status,
    score: status === "pass" ? 1 : 0,
    detail: "reason",
  };
}

describe("buildJudgeCalibrationQueue and paraphrases", () => {
  it("leaves paraphrase variants out of the queue, since they share evidence with the base", () => {
    const queue = buildJudgeCalibrationQueue([
      judge("a/x", "pass"),
      judge("a/x--p1", "fail"),
      judge("a/x--p2", "pass"),
    ]);
    expect(queue.map((item) => item.caseId)).toEqual(["a/x"]);
  });
});
