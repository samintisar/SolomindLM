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

/** Deterministic PRNG (mulberry32) so distribution tests are reproducible. */
function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("normalizeQuizQuestion", () => {
  it("coerces 5 options with answer on fifth slot", () => {
    const out = normalizeQuizQuestion(
      q({
        options: ["a0", "a1", "a2", "a3", "right"],
        answer: 4,
      })
    );
    expect(out.options).toHaveLength(4);
    expect([...out.options].sort()).toEqual(["a0", "a1", "a2", "right"]);
    expect(out.options[out.answer]).toBe("right");
  });

  it("coerces 5 options with answer in first four", () => {
    const out = normalizeQuizQuestion(
      q({
        options: ["o0", "o1", "o2", "o3", "o4"],
        answer: 2,
      })
    );
    expect([...out.options].sort()).toEqual(["o0", "o1", "o2", "o3"]);
    expect(out.options[out.answer]).toBe("o2");
  });

  it("keeps the answer index on the correct option text after shuffling", () => {
    const rng = seededRng(7);
    for (let i = 0; i < 200; i++) {
      const out = normalizeQuizQuestion(
        q({ options: ["A. right", "B. wrong1", "C. wrong2", "D. wrong3"], answer: 0 }),
        rng
      );
      expect(out.options[out.answer]).toBe("right");
      expect([...out.options].sort()).toEqual(["right", "wrong1", "wrong2", "wrong3"]);
    }
  });

  it("spreads the correct answer evenly across positions even when the LLM always puts it first", () => {
    const rng = seededRng(42);
    const counts = [0, 0, 0, 0];
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const out = normalizeQuizQuestion(
        q({ options: ["right", "w1", "w2", "w3"], answer: 0 }),
        rng
      );
      counts[out.answer]++;
    }
    for (const c of counts) {
      expect(c / n).toBeGreaterThan(0.2);
      expect(c / n).toBeLessThan(0.3);
    }
  });

  it("shuffles with Math.random by default", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      seen.add(
        normalizeQuizQuestion(q({ options: ["right", "w1", "w2", "w3"], answer: 0 })).answer
      );
    }
    expect(seen.size).toBe(4);
  });
});
