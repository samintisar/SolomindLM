import { describe, it, expect } from "vitest";
import { calculateNextReview, initializeProficiency } from "./srsScheduling";

describe("calculateNextReview", () => {
  it('resets interval to 1 and schedules ~10 min ahead for "again"', () => {
    const result = calculateNextReview({ interval: 6, easeFactor: 2.5 }, "again");
    expect(result.interval).toBe(1);
    const tenMinutes = 10 * 60 * 1000;
    const diff = result.nextReviewDate - Date.now();
    expect(diff).toBeGreaterThanOrEqual(tenMinutes - 100);
    expect(diff).toBeLessThanOrEqual(tenMinutes + 100);
  });

  it('increases interval with 1.2x multiplier for "hard"', () => {
    const result = calculateNextReview({ interval: 6, easeFactor: 2.5 }, "hard");
    // quality=3 → easeFactor = 2.5 + (0.1 - 2*(0.08+0.04)) = 2.36; interval = round(6*2.36) = 14
    expect(result.interval).toBe(14);
    const oneDay = 24 * 60 * 60 * 1000;
    const expectedDelay = Math.round(14 * 1.2 * oneDay);
    const diff = result.nextReviewDate - Date.now();
    expect(Math.abs(diff - expectedDelay)).toBeLessThan(100);
  });

  it('uses interval * 1 day for "good"', () => {
    const result = calculateNextReview({ interval: 6, easeFactor: 2.5 }, "good");
    // quality=4 → easeFactor = 2.5 + (0.1 - 1*0.1) = 2.5; interval = round(6*2.5) = 15
    expect(result.interval).toBe(15);
    const oneDay = 24 * 60 * 60 * 1000;
    const expectedDelay = 15 * oneDay;
    const diff = result.nextReviewDate - Date.now();
    expect(Math.abs(diff - expectedDelay)).toBeLessThan(100);
  });

  it('uses interval * 1.3x for "easy"', () => {
    const result = calculateNextReview({ interval: 6, easeFactor: 2.5 }, "easy");
    // quality=5 → easeFactor = 2.5 + 0.1 = 2.6; interval = round(6*2.6) = 16
    expect(result.interval).toBe(16);
    const oneDay = 24 * 60 * 60 * 1000;
    const expectedDelay = Math.round(16 * 1.3 * oneDay);
    const diff = result.nextReviewDate - Date.now();
    expect(Math.abs(diff - expectedDelay)).toBeLessThan(100);
  });

  it("clamps ease factor to 1.3 minimum", () => {
    const result = calculateNextReview({ interval: 1, easeFactor: 1.3 }, "again");
    expect(result.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  it("sets interval to 1 from zero for quality >= 3", () => {
    const result = calculateNextReview({ interval: 0, easeFactor: 2.5 }, "good");
    expect(result.interval).toBe(1);
  });

  it("sets interval to 6 when current interval is 1", () => {
    const result = calculateNextReview({ interval: 1, easeFactor: 2.5 }, "good");
    expect(result.interval).toBe(6);
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
    });
  });
});
