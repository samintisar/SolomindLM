import { describe, expect, test } from "vitest";
import {
  applyViewerProgress,
  forViewer,
  practiceItemType,
  savedCardProficiency,
  withCardReview,
  withLastViewedIndex,
  withoutAnswers,
  withoutFlashcardProgress,
  withoutPracticeProgress,
  withoutQuizProgress,
  withoutWrittenQuestionProgress,
  withQuizAnswer,
  withShowMastered,
  withWrittenAnswer,
  withWrittenDraft,
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

const REVIEWED = {
  interval: 1,
  easeFactor: 2.5,
  streak: 1,
  totalReviews: 1,
  correctCount: 1,
  incorrectCount: 0,
};

describe("practiceItemType", () => {
  test("names the practice table for a table name or list tag", () => {
    expect(practiceItemType("flashcards")).toBe("flashcards");
    expect(practiceItemType("flashcard")).toBe("flashcards");
    expect(practiceItemType("quiz")).toBe("quizzes");
    expect(practiceItemType("writtenQuestions")).toBe("writtenQuestions");
    expect(practiceItemType("report")).toBeNull();
  });
});

describe("applyViewerProgress", () => {
  test("lays a viewer's card reviews, Due/All choice and last card over a stripped deck", () => {
    const row = {
      cardsData: [
        { front: "Q1", back: "A1" },
        { front: "Q2", back: "A2" },
      ],
      metadata: { difficulty: "hard" },
    };
    const progress = {
      cards: { "1": { front: "Q2", proficiency: REVIEWED } },
      showMastered: true,
      lastViewedIndex: 1,
    };

    expect(applyViewerProgress("flashcards", row, progress)).toEqual({
      cardsData: [
        { front: "Q1", back: "A1" },
        { front: "Q2", back: "A2", proficiency: REVIEWED },
      ],
      metadata: { difficulty: "hard", showMastered: true, lastViewedIndex: 1 },
    });
    // The row passed in is not mutated.
    expect(row.cardsData[1]).not.toHaveProperty("proficiency");
  });

  test("drops a card review when the card at that index has changed", () => {
    const row = { cardsData: [{ front: "Edited", back: "A" }] };
    const progress = { cards: { "0": { front: "Original", proficiency: REVIEWED } } };
    expect(applyViewerProgress("flashcard", row, progress).cardsData).toEqual([
      { front: "Edited", back: "A" },
    ]);
  });

  test("lays a viewer's answers over a quiz or written set", () => {
    const quiz = { metadata: { difficulty: "easy" } };
    expect(
      applyViewerProgress("quiz", quiz, { userAnswers: { 0: 1 }, lastViewedIndex: 2 }).metadata
    ).toEqual({ difficulty: "easy", userAnswers: { 0: 1 }, lastViewedIndex: 2 });

    const written = { questionType: "short" };
    expect(
      applyViewerProgress("writtenQuestions", written, {
        userAnswers: { q1: { answer: "Mine", graded: false } },
      })
    ).toEqual({
      questionType: "short",
      metadata: { userAnswers: { q1: { answer: "Mine", graded: false } } },
    });
  });

  test("leaves the row alone without progress, or for other types", () => {
    const row = { metadata: { difficulty: "easy" } };
    expect(applyViewerProgress("quizzes", row, undefined)).toBe(row);
    expect(applyViewerProgress("report", row, { lastViewedIndex: 3 })).toBe(row);
  });
});

describe("forViewer", () => {
  test("replaces the owner's progress with the viewer's", () => {
    const row = { metadata: { difficulty: "easy", userAnswers: { 0: 1 }, lastViewedIndex: 4 } };
    expect(forViewer("quizzes", row, { userAnswers: { 0: 0 } }).metadata).toEqual({
      difficulty: "easy",
      userAnswers: { 0: 0 },
    });
    expect(forViewer("quizzes", row, undefined).metadata).toEqual({ difficulty: "easy" });
  });
});

describe("viewer progress updates", () => {
  test("a card review is stored by index with the card's front", () => {
    const progress = withCardReview({ showMastered: true }, 2, "Q3", REVIEWED);
    expect(progress).toEqual({
      showMastered: true,
      cards: { "2": { front: "Q3", proficiency: REVIEWED } },
    });
    expect(savedCardProficiency(progress, 2, "Q3")).toEqual(REVIEWED);
    expect(savedCardProficiency(progress, 2, "Changed")).toBeUndefined();
    expect(savedCardProficiency(undefined, 0, "Q1")).toBeUndefined();
  });

  test("preferences and position replace only their own field", () => {
    expect(withShowMastered({ lastViewedIndex: 4 }, false)).toEqual({
      lastViewedIndex: 4,
      showMastered: false,
    });
    expect(withLastViewedIndex(undefined, 3)).toEqual({ lastViewedIndex: 3 });
  });

  test("quiz answers merge by question index", () => {
    expect(withQuizAnswer({ userAnswers: { 0: 1 } }, 2, 0)).toEqual({
      userAnswers: { 0: 1, 2: 0 },
    });
  });

  test("a written draft keeps an earlier grade; a graded answer replaces the entry", () => {
    const graded = { userAnswers: { q1: { answer: "Old", graded: true, score: 3 } } };
    expect(withWrittenDraft(graded, "q1", "New")).toEqual({
      userAnswers: { q1: { answer: "New", graded: true, score: 3 } },
    });
    expect(withWrittenDraft(undefined, "q2", "Fresh")).toEqual({
      userAnswers: { q2: { graded: false, answer: "Fresh" } },
    });
    expect(
      withWrittenAnswer(graded, "q1", { answer: "Again", graded: false, submittedAt: 5 })
    ).toEqual({ userAnswers: { q1: { answer: "Again", graded: false, submittedAt: 5 } } });
  });

  test("Try again clears the answers and goes back to the start", () => {
    expect(withoutAnswers({ userAnswers: { 0: 1 }, lastViewedIndex: 4 })).toEqual({
      userAnswers: {},
      lastViewedIndex: 0,
    });
  });
});
