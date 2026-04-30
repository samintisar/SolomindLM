import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { updateProficiencyAfterReview } from "./flashcards";

describe("updateProficiencyAfterReview", () => {
  const now = new Date("2026-04-29T12:00:00Z");
  const minute = 60 * 1000;
  const day = 24 * 60 * minute;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps a new card in learning when the user chooses Good on the first step", () => {
    const updated = updateProficiencyAfterReview(undefined, "good");

    expect(updated).toMatchObject({
      interval: 0,
      easeFactor: 2.5,
      phase: "learning",
      learningStep: 1,
      totalReviews: 1,
      correctCount: 1,
      incorrectCount: 0,
      streak: 1,
      lastReviewedAt: now.getTime(),
    });
    expect(updated.nextReviewDate).toBe(now.getTime() + 10 * minute);
  });

  it("graduates a learning card after Good on the final learning step", () => {
    const updated = updateProficiencyAfterReview(
      {
        interval: 0,
        easeFactor: 2.5,
        phase: "learning",
        learningStep: 1,
        totalReviews: 1,
        correctCount: 1,
        incorrectCount: 0,
        streak: 1,
        lastReviewedAt: now.getTime() - 10 * minute,
      },
      "good"
    );

    expect(updated).toMatchObject({
      interval: 1,
      easeFactor: 2.5,
      phase: "review",
      totalReviews: 2,
      correctCount: 2,
      incorrectCount: 0,
      streak: 2,
      lastReviewedAt: now.getTime(),
    });
    expect(updated.learningStep).toBeUndefined();
    expect(updated.nextReviewDate).toBe(now.getTime() + day);
  });

  it("sends a review card to relearning when the user chooses Again", () => {
    const updated = updateProficiencyAfterReview(
      {
        interval: 10,
        easeFactor: 2.5,
        phase: "review",
        totalReviews: 5,
        correctCount: 5,
        incorrectCount: 0,
        streak: 5,
        nextReviewDate: now.getTime() - day,
        lastReviewedAt: now.getTime() - 10 * day,
      },
      "again"
    );

    expect(updated).toMatchObject({
      interval: 0,
      easeFactor: 2.3,
      phase: "relearning",
      learningStep: 0,
      totalReviews: 6,
      correctCount: 5,
      incorrectCount: 1,
      streak: 0,
      lastReviewedAt: now.getTime(),
    });
    expect(updated.nextReviewDate).toBe(now.getTime() + 10 * minute);
  });
});
