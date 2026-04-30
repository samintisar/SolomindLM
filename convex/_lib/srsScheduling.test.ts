import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateNextReview, initializeProficiency } from "./srsScheduling";

describe("calculateNextReview", () => {
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

  it("uses Anki-style learning steps for a new card", () => {
    const current = { interval: 0, easeFactor: 2.5 };

    const again = calculateNextReview(current, "again");
    const hard = calculateNextReview(current, "hard");
    const good = calculateNextReview(current, "good");
    const easy = calculateNextReview(current, "easy");

    expect(again.nextReviewDate - now.getTime()).toBe(1 * minute);
    expect(hard.nextReviewDate - now.getTime()).toBe(6 * minute);
    expect(good.nextReviewDate - now.getTime()).toBe(10 * minute);
    expect(easy.nextReviewDate - now.getTime()).toBe(4 * day);
    expect(again.interval).toBe(0);
    expect(hard.interval).toBe(0);
    expect(good.interval).toBe(0);
    expect(easy.interval).toBe(4);
  });

  it("keeps review delays ordered as hard < good < easy", () => {
    const current = { interval: 10, easeFactor: 2.5 };

    const hard = calculateNextReview(current, "hard");
    const good = calculateNextReview(current, "good");
    const easy = calculateNextReview(current, "easy");

    expect(hard.interval).toBe(12);
    expect(good.interval).toBe(25);
    expect(easy.interval).toBe(33);
    expect(hard.nextReviewDate).toBeLessThan(good.nextReviewDate);
    expect(good.nextReviewDate).toBeLessThan(easy.nextReviewDate);
  });

  it('puts a lapsed review card into relearning for "again"', () => {
    const result = calculateNextReview({ interval: 10, easeFactor: 2.5 }, "again");

    expect(result.interval).toBe(0);
    expect(result.nextReviewDate - now.getTime()).toBe(10 * minute);
    expect(result.easeFactor).toBe(2.3);
  });

  it("clamps ease factor to 1.3 minimum", () => {
    const result = calculateNextReview({ interval: 10, easeFactor: 1.3 }, "again");

    expect(result.easeFactor).toBe(1.3);
  });
});

describe("initializeProficiency", () => {
  it("returns correct defaults", () => {
    const p = initializeProficiency();
    expect(p).toEqual({
      interval: 0,
      easeFactor: 2.5,
      streak: 0,
      totalReviews: 0,
      correctCount: 0,
      incorrectCount: 0,
      phase: "learning",
      learningStep: 0,
    });
  });
});
