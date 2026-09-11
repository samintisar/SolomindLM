/**
 * Rate limiting configuration using @convex-dev/rate-limiter.
 * Defines daily limits for content generation features.
 *
 * The per-feature limit numbers are NOT defined here — they live in
 * `./errors` (`FREE_DAILY_LIMITS` / `PRO_DAILY_LIMITS`) and both the accessors
 * and the rate-limiter window config below are derived from them.
 */

import { HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";
import { type DailyFeature, FREE_DAILY_LIMITS, PRO_DAILY_LIMITS } from "./errors";

export type { DailyFeature } from "./errors";
export { getFreeLimit, getProLimit } from "./errors";

const DAY = 24 * HOUR;

type FixedWindow = { kind: "fixed window"; rate: number; period: number };

/** Build `{ chatFree: {...}, flashcardFree: {...}, ... }` from a limit map. */
function tierWindows<S extends string>(
  limits: Record<DailyFeature, number>,
  suffix: S
): Record<`${DailyFeature}${S}`, FixedWindow> {
  return Object.fromEntries(
    Object.entries(limits).map(([feature, rate]) => [
      `${feature}${suffix}`,
      { kind: "fixed window", rate, period: DAY } satisfies FixedWindow,
    ])
  ) as Record<`${DailyFeature}${S}`, FixedWindow>;
}

/**
 * Full rate-limiter config. Exported so tests can assert every window is
 * derived from the canonical limit maps.
 */
export const RATE_LIMIT_CONFIG = {
  // Free + Pro daily content-generation limits, derived from the canonical maps.
  ...tierWindows(FREE_DAILY_LIMITS, "Free"),
  ...tierWindows(PRO_DAILY_LIMITS, "Pro"),

  /** Joining notebooks via share link (per user, per hour) */
  shareRedeem: { kind: "fixed window", rate: 60, period: HOUR },
  /** Forking a notebook from a fork link (per user, per hour) */
  notebookFork: { kind: "fixed window", rate: 20, period: HOUR },
  /** In-app feedback submissions (per user, per hour) */
  feedbackSubmit: { kind: "fixed window", rate: 5, period: HOUR },
} satisfies Record<string, FixedWindow>;

export const rateLimiter = new RateLimiter(components.rateLimiter, RATE_LIMIT_CONFIG);
