import { describe, expect, it } from "vitest";
import { scoreJudgeCalibration } from "./judgeCalibration";
import type { JudgeCalibrationItem } from "./judgeQueue";

function item(
  partial: Partial<JudgeCalibrationItem> & Pick<JudgeCalibrationItem, "humanAgree">
): JudgeCalibrationItem {
  return {
    id: 1,
    caseId: "c",
    runner: "chat",
    metric: "binary_judge_chat_grounding",
    modelStatus: "pass",
    score: 1,
    modelReason: "ok",
    ...partial,
  };
}

describe("scoreJudgeCalibration", () => {
  it("ignores unlabeled rows and reports agreement on labeled rows", () => {
    const result = scoreJudgeCalibration([
      item({ id: 1, humanAgree: true, modelStatus: "pass" }),
      item({ id: 2, humanAgree: false, modelStatus: "fail" }),
      item({ id: 3, humanAgree: null, modelStatus: "pass" }),
    ]);
    expect(result.labeled).toBe(2);
    expect(result.unlabeled).toBe(1);
    expect(result.agreed).toBe(1);
    expect(result.agreement).toBe(0.5);
    expect(result.readyForPromptCompile).toBe(false);
  });

  it("is ready when at least 20 labeled rows and agreement is >= 0.8", () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      item({
        id: i + 1,
        humanAgree: i < 16,
        modelStatus: "fail",
      })
    );
    const result = scoreJudgeCalibration(items);
    expect(result.labeled).toBe(20);
    expect(result.agreement).toBe(0.8);
    expect(result.readyForPromptCompile).toBe(true);
  });
});
