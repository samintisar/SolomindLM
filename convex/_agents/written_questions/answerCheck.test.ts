import { describe, expect, it } from "vitest";
import { applyQuestionChecks, hasAnswerWorking, type WrittenQuestionCheck } from "./postprocess.js";
import type { WrittenQuestion } from "./prompts.js";

function question(id: string, modelAnswer: string, criteria = ["accuracy"]): WrittenQuestion {
  return {
    id,
    question: `Question ${id}`,
    questionType: "short",
    rubric: { maxPoints: 5, criteria },
    modelAnswer,
  };
}

function check(
  id: string,
  verdict: WrittenQuestionCheck["verdict"],
  fix: Partial<WrittenQuestionCheck> = {}
) {
  return { id, verdict, reason: "", question: "", modelAnswer: "", criteria: [], ...fix };
}

describe("hasAnswerWorking", () => {
  it("finds the writer's working left in a model answer", () => {
    expect(hasAnswerWorking("PV is $86,779.71. Wait, let me re-calculate carefully.")).toBe(true);
    expect(hasAnswerWorking("NPV is +$8,881.53 (Self-Correction Note: the rate is 8%).")).toBe(
      true
    );
    expect(hasAnswerWorking("Hmm, the margin is 3.125.")).toBe(true);
    expect(hasAnswerWorking("Profit is 3.125. On second thought, it is 1.5625.")).toBe(true);
  });

  it("leaves ordinary prose alone", () => {
    expect(hasAnswerWorking("Customers wait, on average, five minutes per order.")).toBe(false);
    expect(hasAnswerWorking("A correction to the forecast lowered revenue by 2%.")).toBe(false);
    expect(hasAnswerWorking(null)).toBe(false);
  });
});

describe("applyQuestionChecks", () => {
  it("keeps ok questions, applies fixes and drops rejected ones", () => {
    const npv = question("npv", "NPV is -$13,220.29, so reject.", ["NPV (-$13,220.29)"]);
    const profit = question("profit", "TC is 9.375, profit 3.125.");
    const circular = question("circ", "Net income rose because net income rose.");
    const result = applyQuestionChecks(
      [npv, profit, circular],
      [
        check("npv", "fix", {
          modelAnswer: "NPV is +$8,881.53, so accept the project.",
          criteria: ["NPV (+$8,881.53)", "accept"],
        }),
        check("profit", "ok"),
        check("circ", "drop", { reason: "circular" }),
      ]
    );
    expect(result.kept.map((q) => q.id)).toEqual(["npv", "profit"]);
    expect(result.kept[0].modelAnswer).toBe("NPV is +$8,881.53, so accept the project.");
    expect(result.kept[0].rubric.criteria).toEqual(["NPV (+$8,881.53)", "accept"]);
    expect(result.kept[0].question).toBe("Question npv");
    expect(result.dropped.map((q) => q.id)).toEqual(["circ"]);
    expect(result.fixed).toBe(1);
  });

  it("drops a question whose answer still shows working, and keeps one the check skipped", () => {
    const result = applyQuestionChecks(
      [question("a", "Wait, let me re-calculate: 11.2%."), question("b", "Sales rose 11.2%.")],
      [check("a", "ok")]
    );
    expect(result.kept.map((q) => q.id)).toEqual(["b"]);
    expect(result.dropped.map((q) => q.id)).toEqual(["a"]);
  });
});
