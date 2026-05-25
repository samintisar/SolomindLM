import { describe, expect, it } from "vitest";
import { normalizeQuizQuestion, stripMultipleChoiceLabel } from "./optionLabels";
import type { QuizQuestion } from "./prompts";

function q(
  partial: Partial<QuizQuestion> & Pick<QuizQuestion, "options" | "answer">
): QuizQuestion {
  return {
    question: partial.question ?? "Q",
    options: partial.options,
    answer: partial.answer,
    hint: partial.hint ?? "h",
    explanation: partial.explanation ?? "e",
  };
}

describe("stripMultipleChoiceLabel", () => {
  it("strips A. and A) style prefixes", () => {
    expect(stripMultipleChoiceLabel("A. one")).toBe("one");
    expect(stripMultipleChoiceLabel("A) one")).toBe("one");
    expect(stripMultipleChoiceLabel("B) two")).toBe("two");
  });

  it("strips 1) and (A) forms", () => {
    expect(stripMultipleChoiceLabel("1) foo")).toBe("foo");
    expect(stripMultipleChoiceLabel("(A) bar")).toBe("bar");
  });

  it("strips at most layered prefixes", () => {
    expect(stripMultipleChoiceLabel("A) B) nested")).toBe("nested");
  });

  it("does not strip content that only looks like a label mid-string", () => {
    expect(stripMultipleChoiceLabel("Option A is not at start")).toBe("Option A is not at start");
  });
});

describe("normalizeQuizQuestion", () => {
  it("coerces 5 options with answer on fifth slot", () => {
    const out = normalizeQuizQuestion(
      q({
        options: ["a0", "a1", "a2", "a3", "right"],
        answer: 4,
      })
    );
    expect(out.options).toEqual(["a0", "a1", "a2", "right"]);
    expect(out.answer).toBe(3);
  });

  it("coerces 5 options with answer in first four", () => {
    const out = normalizeQuizQuestion(
      q({
        options: ["o0", "o1", "o2", "o3", "o4"],
        answer: 2,
      })
    );
    expect(out.options).toEqual(["o0", "o1", "o2", "o3"]);
    expect(out.answer).toBe(2);
  });
});
