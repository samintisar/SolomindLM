/**
 * SuperMemo-2 scheduling — pure functions only (safe to import from the web app).
 */

export interface SM2State {
  interval: number;
  easeFactor: number;
  nextReviewDate: number;
  phase: SrsPhase;
  learningStep?: number;
}

export type SrsPhase = "learning" | "review" | "relearning";

export interface CardProficiency {
  nextReviewDate?: number;
  interval: number;
  easeFactor: number;
  streak: number;
  totalReviews: number;
  correctCount: number;
  incorrectCount: number;
  lastReviewedAt?: number;
  phase?: SrsPhase;
  learningStep?: number;
}

const MINUTE = 60 * 1000;
const ONE_DAY = 24 * 60 * MINUTE;
const LEARNING_STEPS_MS = [1 * MINUTE, 10 * MINUTE] as const;
const RELEARNING_STEPS_MS = [10 * MINUTE] as const;
const GRADUATING_INTERVAL_DAYS = 1;
const EASY_INTERVAL_DAYS = 4;
const MIN_EASE_FACTOR = 1.3;
const HARD_INTERVAL_MULTIPLIER = 1.2;
const EASY_BONUS = 1.3;

function clampEase(easeFactor: number): number {
  return Math.max(MIN_EASE_FACTOR, Math.round(easeFactor * 100) / 100);
}

function addDays(now: number, days: number): number {
  return now + days * ONE_DAY;
}

function inferPhase(currentState: {
  interval: number;
  phase?: SrsPhase;
  totalReviews?: number;
}): SrsPhase {
  if (currentState.phase) return currentState.phase;
  if (currentState.interval > 0 && (currentState.totalReviews ?? 1) > 0) return "review";
  return "learning";
}

/**
 * Calculate next review date using Anki-style learning steps plus legacy SM-2 review growth.
 */
export function calculateNextReview(
  currentState: {
    interval: number;
    easeFactor: number;
    phase?: SrsPhase;
    learningStep?: number;
    totalReviews?: number;
  },
  rating: "again" | "hard" | "good" | "easy"
): SM2State {
  const now = Date.now();
  const phase = inferPhase(currentState);
  const learningStep = currentState.learningStep ?? 0;
  const isLearning = phase === "learning" || phase === "relearning";
  const steps = phase === "relearning" ? RELEARNING_STEPS_MS : LEARNING_STEPS_MS;
  const firstStepDelay = steps[0];
  const secondStepDelay = steps[1] ?? firstStepDelay;
  const currentStepDelay = steps[learningStep] ?? firstStepDelay;

  if (isLearning) {
    if (rating === "again") {
      return {
        interval: 0,
        easeFactor: currentState.easeFactor,
        nextReviewDate: now + firstStepDelay,
        phase,
        learningStep: 0,
      };
    }

    if (rating === "hard") {
      const delay =
        learningStep === 0 && steps.length > 1
          ? Math.ceil((firstStepDelay + secondStepDelay) / 2 / MINUTE) * MINUTE
          : Math.min(Math.round(currentStepDelay * 1.5), currentStepDelay + ONE_DAY);

      return {
        interval: 0,
        easeFactor: clampEase(currentState.easeFactor - 0.15),
        nextReviewDate: now + delay,
        phase,
        learningStep,
      };
    }

    if (rating === "good" && learningStep < steps.length - 1) {
      const nextStep = learningStep + 1;
      return {
        interval: 0,
        easeFactor: currentState.easeFactor,
        nextReviewDate: now + (steps[nextStep] ?? firstStepDelay),
        phase,
        learningStep: nextStep,
      };
    }

    if (rating === "easy") {
      return {
        interval: EASY_INTERVAL_DAYS,
        easeFactor: clampEase(currentState.easeFactor + 0.15),
        nextReviewDate: addDays(now, EASY_INTERVAL_DAYS),
        phase: "review",
      };
    }

    return {
      interval: GRADUATING_INTERVAL_DAYS,
      easeFactor: currentState.easeFactor,
      nextReviewDate: addDays(now, GRADUATING_INTERVAL_DAYS),
      phase: "review",
    };
  }

  const currentInterval = Math.max(1, currentState.interval);

  if (rating === "again") {
    return {
      interval: 0,
      easeFactor: clampEase(currentState.easeFactor - 0.2),
      nextReviewDate: now + RELEARNING_STEPS_MS[0],
      phase: "relearning",
      learningStep: 0,
    };
  }

  const hardInterval = Math.max(
    currentInterval + 1,
    Math.round(currentInterval * HARD_INTERVAL_MULTIPLIER)
  );
  const goodInterval = Math.max(
    hardInterval + 1,
    Math.round(currentInterval * currentState.easeFactor)
  );
  const easyInterval = Math.max(goodInterval + 1, Math.round(goodInterval * EASY_BONUS));

  if (rating === "hard") {
    return {
      interval: hardInterval,
      easeFactor: clampEase(currentState.easeFactor - 0.15),
      nextReviewDate: addDays(now, hardInterval),
      phase: "review",
    };
  }

  if (rating === "easy") {
    return {
      interval: easyInterval,
      easeFactor: clampEase(currentState.easeFactor + 0.15),
      nextReviewDate: addDays(now, easyInterval),
      phase: "review",
    };
  }

  return {
    interval: goodInterval,
    easeFactor: currentState.easeFactor,
    nextReviewDate: addDays(now, goodInterval),
    phase: "review",
  };
}

export function initializeProficiency(): CardProficiency {
  return {
    interval: 0,
    easeFactor: 2.5,
    streak: 0,
    totalReviews: 0,
    correctCount: 0,
    incorrectCount: 0,
    phase: "learning",
    learningStep: 0,
  };
}
