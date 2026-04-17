/**
 * SuperMemo-2 scheduling — pure functions only (safe to import from the web app).
 */

export interface SM2State {
  interval: number;
  easeFactor: number;
  nextReviewDate: number;
}

export interface CardProficiency {
  nextReviewDate?: number;
  interval: number;
  easeFactor: number;
  streak: number;
  totalReviews: number;
  correctCount: number;
  incorrectCount: number;
  lastReviewedAt?: number;
}

/**
 * Calculate next review date using SuperMemo 2 (SM-2) algorithm
 */
export function calculateNextReview(
  currentState: { interval: number; easeFactor: number },
  rating: "again" | "hard" | "good" | "easy"
): SM2State {
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const TEN_MINUTES = 10 * 60 * 1000;

  let { interval, easeFactor } = currentState;

  const quality = { again: 0, hard: 3, good: 4, easy: 5 }[rating];

  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  easeFactor = Math.max(1.3, easeFactor);

  if (quality < 3) {
    interval = 1;
  } else if (interval === 0) {
    interval = 1;
  } else if (interval === 1) {
    interval = 6;
  } else {
    interval = Math.round(interval * easeFactor);
  }

  let nextReviewDate: number;
  if (rating === "again") {
    nextReviewDate = now + TEN_MINUTES;
  } else if (rating === "hard") {
    nextReviewDate = now + Math.round(interval * 1.2 * ONE_DAY);
  } else if (rating === "good") {
    nextReviewDate = now + interval * ONE_DAY;
  } else {
    nextReviewDate = now + Math.round(interval * 1.3 * ONE_DAY);
  }

  return { interval, easeFactor, nextReviewDate };
}

export function initializeProficiency(): CardProficiency {
  return {
    interval: 0,
    easeFactor: 2.5,
    streak: 0,
    totalReviews: 0,
    correctCount: 0,
    incorrectCount: 0,
  };
}
