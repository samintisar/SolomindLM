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

export type { DailyFeature } from "./errors";
export { getFreeLimit, getProLimit } from "./errors";

const DAY = 24 * HOUR;

export const WINDOW_PERIOD_MS: Record<LimitWindow, number> = {
  day: DAY,
  week: 7 * DAY,
  month: 30 * DAY,
};

type FixedWindow = { kind: "fixed window"; rate: number; period: number };

/**
 * Build `{ chatFree: {...}, flashcardFree: {...}, ... }` from a limit map.
 * Pro-only features (`null`) get no window: their check rejects before the
 * rate limiter is consulted.
 */
function tierWindows<S extends string>(
  limits: Record<DailyFeature, FeatureLimit | null>,
  suffix: S
): Partial<Record<`${DailyFeature}${S}`, FixedWindow>> {
  return Object.fromEntries(
    Object.entries(limits).flatMap(([feature, limit]) =>
      limit
        ? [
            [
              `${feature}${suffix}`,
              {
                kind: "fixed window",
                rate: limit.rate,
                period: WINDOW_PERIOD_MS[limit.window],
              } satisfies FixedWindow,
            ],
          ]
        : []
    )
  ) as Partial<Record<`${DailyFeature}${S}`, FixedWindow>>;
}

/**
 * Full rate-limiter config. Exported so tests can assert every window is
 * derived from the canonical limit maps.
 */
export const RATE_LIMIT_CONFIG: Record<string, FixedWindow> = {
  // Free + Pro content-generation limits, derived from the canonical maps.
  ...tierWindows(FREE_FEATURE_LIMITS, "Free"),
  ...tierWindows(PRO_FEATURE_LIMITS, "Pro"),

  /** Joining notebooks via share link (per user, per hour) */
  shareRedeem: { kind: "fixed window", rate: 60, period: HOUR },
  /** Forking a notebook from a fork link (per user, per hour) */
  notebookFork: { kind: "fixed window", rate: 20, period: HOUR },
  /** In-app feedback submissions (per user, per hour) */
  feedbackSubmit: { kind: "fixed window", rate: 5, period: HOUR },
};

export const rateLimiter = new RateLimiter(components.rateLimiter, RATE_LIMIT_CONFIG);
