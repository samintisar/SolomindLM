import { describe, expect, test } from "vitest";
import {
  withoutFlashcardProgress,
  withoutPracticeProgress,
  withoutQuizProgress,
  withoutWrittenQuestionProgress,
} from "./practiceProgress";

const PROFICIENCY = { interval: 30, easeFactor: 2.6, streak: 4, totalReviews: 6 };

describe("withoutFlashcardProgress", () => {
  test("drops each card's review history and the owner's view state, keeping the deck", () => {
    const row = {
      title: "Deck",
      cardsData: [
        { front: "Q1", back: "A1", proficiency: PROFICIENCY },
        { front: "Q2", back: "A2" },
      ],
      metadata: { difficulty: "hard", cardCount: 2, showMastered: true, lastViewedIndex: 1 },
    };

    expect(withoutFlashcardProgress(row)).toEqual({
      title: "Deck",
      cardsData: [
        { front: "Q1", back: "A1" },
        { front: "Q2", back: "A2" },
      ],
      metadata: { difficulty: "hard", cardCount: 2 },
    });
    // The stored row is not mutated.
    expect(row.cardsData[0]).toHaveProperty("proficiency");
    expect(row.metadata).toHaveProperty("showMastered");
  });

  test("leaves a row without cards or metadata alone", () => {
    expect(withoutFlashcardProgress({ title: "Empty" })).toStrictEqual({ title: "Empty" });
  });
});

describe("withoutQuizProgress", () => {
  test("drops the chosen answers and the last question viewed", () => {
    const row = {
      questionsData: [{ question: "Q", options: ["a", "b"], correctAnswer: 1 }],
      metadata: { difficulty: "easy", userAnswers: { 0: 1 }, lastViewedIndex: 0 },
    };

    expect(withoutQuizProgress(row)).toEqual({
      questionsData: row.questionsData,
      metadata: { difficulty: "easy" },
    });
  });
});

describe("withoutWrittenQuestionProgress", () => {
  test("drops drafts, grades and feedback and the last question viewed", () => {
    const row = {
      questionsData: [{ id: "q1", question: "Why?" }],
      questionType: "short",
      metadata: {
        focus: "causes",
        userAnswers: { q1: { answer: "Because", graded: true, score: 4, feedback: "Good" } },
        lastViewedIndex: 0,
      },
    };

    expect(withoutWrittenQuestionProgress(row)).toEqual({
      questionsData: row.questionsData,
      questionType: "short",
      metadata: { focus: "causes" },
    });
  });
});

describe("withoutPracticeProgress", () => {
  test("strips by table name or list tag and passes other types through", () => {
    const quiz = { metadata: { userAnswers: { 0: 1 } } };
    expect(withoutPracticeProgress("quizzes", quiz).metadata).toEqual({});
    expect(withoutPracticeProgress("quiz", quiz).metadata).toEqual({});
    expect(withoutPracticeProgress("writtenQuestions", quiz).metadata).toEqual({});
    const card = { cardsData: [{ front: "Q", proficiency: PROFICIENCY }] };
    expect(withoutPracticeProgress("flashcard", card).cardsData).toEqual([{ front: "Q" }]);
    const report = { metadata: { userAnswers: "kept" } };
    expect(withoutPracticeProgress("report", report)).toBe(report);
  });
});
