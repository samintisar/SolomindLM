import { describe, expect, it } from "vitest";
import type { EvalFixture, EvalRunArtifact, MetricResult } from "../types";
import { scoreStudioMetrics } from "./studio";

const fixture = { id: "case", runner: "quiz" } as EvalFixture;

function artifact(kind: "quiz" | "flashcards", raw: unknown): EvalRunArtifact {
  return {
    caseId: "case",
    runner: kind,
    configHash: "h",
    answer: "",
    studioOutput: { kind, raw },
  } as unknown as EvalRunArtifact;
}

let questionSeq = 0;
function quizQuestion(answer: number, overrides: Record<string, unknown> = {}) {
  questionSeq++;
  return {
    question: `Question ${questionSeq}`,
    options: ["alpha", "beta", "gamma", "delta"],
    answer,
    hint: "Think about the definition.",
    explanation: "Alpha is correct because the source defines it that way.",
    ...overrides,
  };
}

async function metric(a: EvalRunArtifact, name: string): Promise<MetricResult> {
  const found = (await scoreStudioMetrics(fixture, a)).find((m) => m.metric === name);
  if (!found) throw new Error(`metric ${name} not emitted`);
  return found;
}

describe("quiz_answer_position_balance", () => {
  it("fails when the correct answer is almost always the first option", async () => {
    const answers = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 1];
    const m = await metric(
      artifact("quiz", { questions: answers.map((a) => quizQuestion(a)) }),
      "quiz_answer_position_balance"
    );
    expect(m.status).toBe("fail");
    expect(m.breakdown?.counts).toEqual([17, 2, 1, 0]);
  });

  it("fails on a milder but still significant skew (12 of 20 on one position)", async () => {
    const answers = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 2, 2, 2, 3, 3];
    const m = await metric(
      artifact("quiz", { questions: answers.map((a) => quizQuestion(a)) }),
      "quiz_answer_position_balance"
    );
    expect(m.status).toBe("fail");
  });

  it("passes a roughly uniform spread", async () => {
    const answers = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 2, 3, 1];
    const m = await metric(
      artifact("quiz", { questions: answers.map((a) => quizQuestion(a)) }),
      "quiz_answer_position_balance"
    );
    expect(m.status).toBe("pass");
  });

  it("is informational when there are too few questions to judge", async () => {
    const m = await metric(
      artifact("quiz", { questions: [0, 0, 0].map((a) => quizQuestion(a)) }),
      "quiz_answer_position_balance"
    );
    expect(m.status).toBe("info");
  });
});

describe("quiz_option_validity", () => {
  it("passes well-formed questions", async () => {
    const m = await metric(
      artifact("quiz", { questions: [quizQuestion(0), quizQuestion(2)] }),
      "quiz_option_validity"
    );
    expect(m.status).toBe("pass");
    expect(m.score).toBe(1);
  });

  it("flags out-of-range answers, duplicate options, wrong option counts and blank options", async () => {
    const m = await metric(
      artifact("quiz", {
        questions: [
          quizQuestion(0),
          quizQuestion(4),
          quizQuestion(0, { options: ["same", "Same ", "x", "y"] }),
          quizQuestion(0, { options: ["a", "b", "c"] }),
          quizQuestion(1, { options: ["a", "", "c", "d"] }),
        ],
      }),
      "quiz_option_validity"
    );
    expect(m.status).toBe("fail");
    expect(m.score).toBeCloseTo(1 / 5);
    expect(m.breakdown?.invalid).toHaveLength(4);
  });
});

describe("quiz_explanation_positional_refs", () => {
  it("warns when hints or explanations point at options by letter or position", async () => {
    const m = await metric(
      artifact("quiz", {
        questions: [
          quizQuestion(0, { explanation: "Option B is wrong because it ignores seasonality." }),
          quizQuestion(0, { hint: "Look closely at the first choice." }),
          quizQuestion(0, { explanation: "The rate rises, so (C) cannot hold." }),
          quizQuestion(0, { explanation: "Answer 2 misreads the passage." }),
          quizQuestion(0),
        ],
      }),
      "quiz_explanation_positional_refs"
    );
    expect(m.status).toBe("warn");
    expect(m.breakdown?.flagged).toEqual([0, 1, 2, 3]);
  });

  it("does not flag content that merely contains capital letters", async () => {
    const m = await metric(
      artifact("quiz", {
        questions: [
          quizQuestion(0, { explanation: "Agent A hands off to Agent B, as in Plan A." }),
          quizQuestion(0, { explanation: "Vitamin C and Type A personalities are unrelated." }),
        ],
      }),
      "quiz_explanation_positional_refs"
    );
    expect(m.status).toBe("pass");
  });
});

describe("flashcard_card_validity", () => {
  it("flags empty sides and duplicate fronts", async () => {
    const m = await metric(
      artifact("flashcards", {
        cards: [
          { front: "What is X?", back: "X is Y." },
          { front: "what is x? ", back: "Duplicate." },
          { front: "", back: "No front." },
          { front: "Z?", back: "  " },
          { question: "Legacy field?", answer: "Still counted." },
        ],
      }),
      "flashcard_card_validity"
    );
    expect(m.status).toBe("fail");
    expect(m.score).toBeCloseTo(2 / 5);
  });

  it("passes clean cards", async () => {
    const m = await metric(
      artifact("flashcards", {
        cards: [
          { front: "A?", back: "a" },
          { front: "B?", back: "b" },
        ],
      }),
      "flashcard_card_validity"
    );
    expect(m.status).toBe("pass");
  });
});

describe("flashcard_answer_leak", () => {
  it("flags cards that give the answer away or break the blank", async () => {
    const m = await metric(
      artifact("flashcards", {
        cards: [
          { front: "Il cherche ___ (ses) clés.", back: "ses" },
          { front: "Je ___ habite à Paris.", back: "j'" },
          { front: "What is the capital of France?", back: "Paris" },
          { front: "Tu ___ à Paris.", back: "habites" },
        ],
      }),
      "flashcard_answer_leak"
    );
    expect(m.status).toBe("fail");
    expect(m.score).toBeCloseTo(2 / 4);
  });

  it("passes clean cards", async () => {
    const m = await metric(
      artifact("flashcards", {
        cards: [
          { front: "What is the capital of France?", back: "Paris" },
          { question: "Il ___ (chercher) ses clés.", answer: "cherche" },
        ],
      }),
      "flashcard_answer_leak"
    );
    expect(m.status).toBe("pass");
  });
});
