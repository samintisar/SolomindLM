import { describe, expect, it } from "vitest";
import type { WrittenQuestion } from "./prompts.js";
import { padQuestionsToTarget } from "./postprocess.js";

function makeQuestion(id: string, text: string): WrittenQuestion {
  return {
    id,
    question: text,
    questionType: "short",
    rubric: { maxPoints: 5, criteria: ["accuracy"] },
    modelAnswer: "answer",
  };
}

describe("padQuestionsToTarget", () => {
  it("returns selected unchanged when already at target", () => {
    const selected = [makeQuestion("a", "Q1"), makeQuestion("b", "Q2")];
    expect(padQuestionsToTarget(selected, selected, 2)).toEqual(selected);
  });

  it("pads from pool without duplicate ids", () => {
    const selected = [makeQuestion("a", "Q1")];
    const pool = [
      makeQuestion("a", "Q1"),
      makeQuestion("b", "Q2"),
      makeQuestion("c", "Q3"),
    ];
    const result = padQuestionsToTarget(selected, pool, 3);
    expect(result).toHaveLength(3);
    expect(result.map((q) => q.id)).toEqual(["a", "b", "c"]);
  });

  it("skips same stem with different ids when padding", () => {
    const selected = [makeQuestion("a", "What is prompt chaining?")];
    const pool = [
      makeQuestion("b", "What is prompt chaining?"),
      makeQuestion("c", "What is routing?"),
    ];
    const result = padQuestionsToTarget(selected, pool, 3);
    expect(result).toHaveLength(2);
    expect(result.map((q) => q.id)).toEqual(["a", "c"]);
  });

  it("caps at target when selected exceeds target", () => {
    const selected = [
      makeQuestion("a", "Q1"),
      makeQuestion("b", "Q2"),
      makeQuestion("c", "Q3"),
    ];
    expect(padQuestionsToTarget(selected, selected, 2)).toHaveLength(2);
  });
});
