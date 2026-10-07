/**
 * Rate limiting configuration using @convex-dev/rate-limiter.
 * Defines per-window usage limits for content generation features.
 *
 * The per-feature limit numbers are NOT defined here — they live in
 * `./errors` (`FREE_FEATURE_LIMITS` / `PRO_FEATURE_LIMITS`) and both the
 * accessors and the rate-limiter window config below are derived from them.
 */

import { HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";
import {
  type DailyFeature,
  type FeatureLimit,
  FREE_FEATURE_LIMITS,
  type LimitWindow,
  PRO_FEATURE_LIMITS,
} from "./errors";
import {
  FREE_FLASHCARD_GLOBAL_DAILY_ATTEMPTS,
  FREE_FLASHCARD_GLOBAL_DAILY_LIMIT,
  FREE_FLASHCARD_IP_DAILY_ATTEMPTS,
  FREE_FLASHCARD_IP_DAILY_LIMIT,
} from "./freeToolBounds";

export type { DailyFeature } from "./errors";
export { getFreeLimit, getProLimit } from "./errors";

const DAY = 24 * HOUR;

export const WINDOW_PERIOD_MS: Record<LimitWindow, number> = {
  day: DAY,
  week: 7 * DAY,
  month: 30 * DAY,
};

type FixedWindow = { kind: "fixed window"; rate: number; period: number };
type TokenBucket = { kind: "token bucket"; rate: number; period: number; capacity: number };
type LimitConfig = FixedWindow | TokenBucket;

/**
 * Daily limits keep the original fixed windows. Weekly and 30-day limits use a
 * token bucket instead: a fixed window with no `start` begins at a random point
 * per user, so a 30-day window could roll over minutes after a run and allow a
 * second one at once. A bucket refills one run every `period / rate`.
 */
function windowConfig(limit: FeatureLimit): LimitConfig {
  const period = WINDOW_PERIOD_MS[limit.window];
  return limit.window === "day"
    ? { kind: "fixed window", rate: limit.rate, period }
    : { kind: "token bucket", rate: limit.rate, period, capacity: limit.rate };
}

/**
 * Build `{ chatFree: {...}, flashcardFree: {...}, ... }` from a limit map.
 * Pro-only features (`null`) get no window: their check rejects before the
 * rate limiter is consulted.
 */
function tierWindows<S extends string>(
  limits: Record<DailyFeature, FeatureLimit | null>,
  suffix: S
): Partial<Record<`${DailyFeature}${S}`, LimitConfig>> {
  return Object.fromEntries(
    Object.entries(limits).flatMap(([feature, limit]) =>
      limit ? [[`${feature}${suffix}`, windowConfig(limit)]] : []
    )
  ) as Partial<Record<`${DailyFeature}${S}`, LimitConfig>>;
}

/**
 * Full rate-limiter config. Exported so tests can assert every window is
 * derived from the canonical limit maps.
 */
export const RATE_LIMIT_CONFIG: Record<string, LimitConfig> = {
  // Free + Pro content-generation limits, derived from the canonical maps.
  ...tierWindows(FREE_FEATURE_LIMITS, "Free"),
  ...tierWindows(PRO_FEATURE_LIMITS, "Pro"),

  /** Joining notebooks via share link (per user, per hour) */
  shareRedeem: { kind: "fixed window", rate: 60, period: HOUR },
  /** Forking a notebook from a fork link (per user, per hour) */
  notebookFork: { kind: "fixed window", rate: 20, period: HOUR },
  /** In-app feedback submissions (per user, per hour) */
  feedbackSubmit: { kind: "fixed window", rate: 5, period: HOUR },
  /** Free no-signup flashcard tool: runs per salted-hash IP per day */
  freeToolFlashcardsIp: { kind: "fixed window", rate: FREE_FLASHCARD_IP_DAILY_LIMIT, period: DAY },
  /** Free no-signup flashcard tool: all anonymous runs per day (cost circuit breaker, single key) */
  freeToolFlashcardsGlobal: {
    kind: "fixed window",
    rate: FREE_FLASHCARD_GLOBAL_DAILY_LIMIT,
    period: DAY,
  },
  /** Free flashcard tool: LLM calls (failures included) per salted-hash IP per day */
  freeToolFlashcardsIpAttempts: {
    kind: "fixed window",
    rate: FREE_FLASHCARD_IP_DAILY_ATTEMPTS,
    period: DAY,
  },
  /** Free flashcard tool: all anonymous LLM calls per day (the hard cost bound, single key) */
  freeToolFlashcardsGlobalAttempts: {
    kind: "fixed window",
    rate: FREE_FLASHCARD_GLOBAL_DAILY_ATTEMPTS,
    period: DAY,
  },
};

export const rateLimiter = new RateLimiter(components.rateLimiter, RATE_LIMIT_CONFIG);
