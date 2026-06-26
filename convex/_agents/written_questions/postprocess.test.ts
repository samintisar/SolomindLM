import { describe, expect, it } from "vitest";
import {
  appendUniqueWrittenQuestions,
  applySelectedQuestionIds,
  padQuestionsToTarget,
} from "./postprocess.js";
import type { WrittenQuestion } from "./prompts.js";

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
    const pool = [makeQuestion("a", "Q1"), makeQuestion("b", "Q2"), makeQuestion("c", "Q3")];
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
    const selected = [makeQuestion("a", "Q1"), makeQuestion("b", "Q2"), makeQuestion("c", "Q3")];
    expect(padQuestionsToTarget(selected, selected, 2)).toHaveLength(2);
  });
});

describe("appendUniqueWrittenQuestions", () => {
  it("merges unique stems up to cap", () => {
    const acc = [makeQuestion("a", "Q1")];
    appendUniqueWrittenQuestions(
      acc,
      [makeQuestion("b", "Q1"), makeQuestion("c", "Q2"), makeQuestion("d", "Q3")],
      3
    );
    expect(acc.map((q) => q.id)).toEqual(["a", "c", "d"]);
  });

  it("stops at cap without scanning the rest", () => {
    const acc: WrittenQuestion[] = [];
    appendUniqueWrittenQuestions(
      acc,
      [makeQuestion("a", "Q1"), makeQuestion("b", "Q2"), makeQuestion("c", "Q3")],
      2
    );
    expect(acc).toHaveLength(2);
  });
});

describe("applySelectedQuestionIds", () => {
  const pool = [
    makeQuestion("a", "What is prompt chaining?"),
    makeQuestion("b", "What is prompt chaining?"),
    makeQuestion("c", "What is routing?"),
    makeQuestion("d", "What is parallelization?"),
  ];

  it("skips duplicate stems from LLM-selected ids", () => {
    const result = applySelectedQuestionIds(pool, ["a", "b", "c"], 2);
    expect(result.map((q) => q.id)).toEqual(["a", "c"]);
  });

  it("backfills with unique stems when selection is short", () => {
    const result = applySelectedQuestionIds(pool, ["a"], 3);
    expect(result.map((q) => q.id)).toEqual(["a", "c", "d"]);
  });
});
