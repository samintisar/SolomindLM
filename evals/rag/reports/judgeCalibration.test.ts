import { describe, expect, it } from "vitest";
import { cohensKappa, type JudgeLabel, scoreJudgeCalibration } from "./judgeCalibration";
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

/** `count` labelled verdicts for one judge, alternating model pass and fail. */
function labelsFor(
  metric: string,
  humanAgree: (index: number) => boolean,
  count = 20
): JudgeLabel[] {
  return Array.from({ length: count }, (_, i) => ({
    metric,
    modelStatus: i % 2 === 0 ? "pass" : "fail",
    humanAgree: humanAgree(i),
  }));
}

const PROMOTING_FAMILIES = [
  "binary_judge_chat_grounding",
  "binary_judge_research_grounding",
  "binary_judge_studio_grounding",
  "binary_judge_studio_structure",
  "binary_judge_lr_sections",
];

describe("cohensKappa", () => {
  it("is 1 for perfect agreement across both verdicts", () => {
    expect(cohensKappa([true, false, true, false], [true, false, true, false])).toBe(1);
  });

  it("is about 0 at chance level", () => {
    // Model says T,T,F,F; human says T,F,T,F: half the pairs agree, exactly what chance gives.
    expect(cohensKappa([true, true, false, false], [true, false, true, false])).toBeCloseTo(0, 10);
  });

  it("matches a hand-computed mixed example", () => {
    // 6 model passes, 4 model fails. Agree on 5 passes and 3 fails (po = 0.8). Humans pass 6 of
    // 10 (pm = ph = 0.6), so pe = 0.36 + 0.16 = 0.52 and kappa = (0.8 - 0.52) / 0.48 = 7 / 12.
    const model = [true, true, true, true, true, true, false, false, false, false];
    const human = [true, true, true, true, true, false, false, false, false, true];
    expect(cohensKappa(model, human)).toBeCloseTo(7 / 12, 10);
  });

  it("is 0 when every verdict is one class, since agreement cannot be told from chance", () => {
    expect(cohensKappa([false, false, false], [false, false, false])).toBe(0);
  });
});

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

  it("reports per-judge agreement and kappa for a perfectly agreeing judge", () => {
    const result = scoreJudgeCalibration(labelsFor("binary_judge_chat_grounding", () => true));
    expect(result.byJudge.binary_judge_chat_grounding).toEqual({
      labeled: 20,
      agreed: 20,
      agreement: 1,
      kappa: 1,
      blockingReady: true,
    });
  });

  it("keeps a family out of the blocking set below 20 labels", () => {
    const result = scoreJudgeCalibration(labelsFor("binary_judge_chat_grounding", () => true, 19));
    expect(result.byJudge.binary_judge_chat_grounding?.blockingReady).toBe(false);
  });

  it("does not block a family with 0.8 agreement but kappa 0 (one-class model verdicts)", () => {
    // The model always fails; humans agree on 16 of 20. Agreement is 0.8, but the model never
    // passes anything, so that agreement is no better than chance.
    const labels = labelsFor("binary_judge_chat_grounding", (i) => i < 16).map((row) => ({
      ...row,
      modelStatus: "fail" as const,
    }));
    const chat = scoreJudgeCalibration(labels).byJudge.binary_judge_chat_grounding;
    expect(chat?.agreement).toBe(0.8);
    expect(chat?.kappa).toBe(0);
    expect(chat?.blockingReady).toBe(false);
  });

  it("is blocking at 20 labels, agreement 0.8 and kappa 0.6", () => {
    // Model alternates pass/fail. Humans disagree on 4 rows (two of each verdict): agreement 0.8,
    // pm = ph = 0.5, pe = 0.5, so kappa = (0.8 - 0.5) / 0.5 = 0.6.
    const labels = labelsFor("binary_judge_chat_grounding", (i) => i % 5 !== 0);
    const chat = scoreJudgeCalibration(labels).byJudge.binary_judge_chat_grounding;
    expect(chat?.agreement).toBe(0.8);
    expect(chat?.kappa).toBeCloseTo(0.6, 10);
    expect(chat?.blockingReady).toBe(true);
  });

  it("requires every promoting judge family to be blocking-ready before readiness", () => {
    const chatOnly = labelsFor("binary_judge_chat_grounding", () => true);
    expect(scoreJudgeCalibration(chatOnly).readyForPromptCompile).toBe(false);

    const all = PROMOTING_FAMILIES.flatMap((metric) => labelsFor(metric, () => true));
    expect(scoreJudgeCalibration(all).readyForPromptCompile).toBe(true);
  });

  it("does not let one weak promoting family hide behind strong ones", () => {
    const all = PROMOTING_FAMILIES.flatMap((metric) =>
      labelsFor(metric, (i) => metric !== "binary_judge_lr_sections" || i < 10)
    );
    const result = scoreJudgeCalibration(all);
    expect(result.byJudge.binary_judge_lr_sections?.blockingReady).toBe(false);
    expect(result.readyForPromptCompile).toBe(false);
  });

  it("reports non-promoting families per judge without affecting readiness", () => {
    const all = [
      ...PROMOTING_FAMILIES.flatMap((metric) => labelsFor(metric, () => true)),
      ...labelsFor("binary_judge_citation_valid", () => false),
      ...labelsFor("rubric:medical-students:findings-attributed", () => false),
    ];
    const result = scoreJudgeCalibration(all);
    expect(result.byJudge.binary_judge_citation_valid?.blockingReady).toBe(false);
    expect(result.byJudge["rubric:medical-students:findings-attributed"]?.labeled).toBe(20);
    expect(result.readyForPromptCompile).toBe(true);
  });
});
