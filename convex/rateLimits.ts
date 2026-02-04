/**
 * Rate limiting configuration using @convex-dev/rate-limiter.
 * Defines daily limits for content generation features.
 */

import { RateLimiter, HOUR } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

const DAY = 24 * HOUR;

// Define all rate limits (free tier limits)
// Pro tier limits will be handled by checking subscription and using separate limits
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // Free tier daily limits
  chatFree: { kind: "fixed window", rate: 50, period: DAY },
  flashcardFree: { kind: "fixed window", rate: 5, period: DAY },
  quizFree: { kind: "fixed window", rate: 5, period: DAY },
  reportFree: { kind: "fixed window", rate: 5, period: DAY },
  audioFree: { kind: "fixed window", rate: 1, period: DAY },
  writtenQuestionFree: { kind: "fixed window", rate: 5, period: DAY },
  spreadsheetFree: { kind: "fixed window", rate: 5, period: DAY },
  slideFree: { kind: "fixed window", rate: 1, period: DAY },

  // Pro tier daily limits
  chatPro: { kind: "fixed window", rate: 500, period: DAY },
  flashcardPro: { kind: "fixed window", rate: 100, period: DAY },
  quizPro: { kind: "fixed window", rate: 100, period: DAY },
  reportPro: { kind: "fixed window", rate: 100, period: DAY },
  audioPro: { kind: "fixed window", rate: 5, period: DAY },
  writtenQuestionPro: { kind: "fixed window", rate: 100, period: DAY },
  spreadsheetPro: { kind: "fixed window", rate: 100, period: DAY },
  slidePro: { kind: "fixed window", rate: 10, period: DAY },
});

/**
 * Get the free tier limit for a feature
 */
export function getFreeLimit(feature: DailyFeature): number {
  const limits: Record<DailyFeature, number> = {
    chat: 50,
    flashcard: 5,
    quiz: 5,
    report: 5,
    audio: 1,
    writtenQuestion: 5,
    spreadsheet: 5,
    slide: 1,
  };
  return limits[feature];
}

/**
 * Get the pro tier limit for a feature
 */
export function getProLimit(feature: DailyFeature): number {
  const limits: Record<DailyFeature, number> = {
    chat: 500,
    flashcard: 100,
    quiz: 100,
    report: 100,
    audio: 5,
    writtenQuestion: 100,
    spreadsheet: 100,
    slide: 10,
  };
  return limits[feature];
}

/**
 * Type for features with daily limits
 */
export type DailyFeature =
  | "chat"
  | "flashcard"
  | "quiz"
  | "report"
  | "audio"
  | "writtenQuestion"
  | "spreadsheet"
  | "slide";
