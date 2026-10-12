/**
 * Wall-clock budget for a single Studio job action.
 *
 * Convex kills actions at 600s without running their catch blocks, so a job
 * that overruns is never marked failed. Phases use this to size each LLM call's
 * timeout so the action always gets back to its own error handling in time.
 */

/** Budget for one finalize action: ends (saved or marked failed) well before the 600s kill. */
export const STUDIO_FINALIZE_BUDGET_MS = 540_000;
/** Held back from a finalize phase's last LLM step for title generation and saving. */
export const STUDIO_SAVE_RESERVE_MS = 30_000;
/** Cap for the title call that runs just before saving. */
export const STUDIO_TITLE_TIMEOUT_MS = 20_000;

export type JobDeadline = {
  /** Milliseconds left in the budget (never negative). */
  remainingMs(): number;
  /**
   * Timeout for one step: at most `capMs`, and never more than what is left
   * after setting aside `reserveMs` for the steps that follow.
   */
  stepTimeoutMs(capMs: number, reserveMs?: number): number;
};

export function createJobDeadline(budgetMs: number, now: () => number = Date.now): JobDeadline {
  const endsAt = now() + budgetMs;
  const remainingMs = () => Math.max(0, endsAt - now());

  return {
    remainingMs,
    stepTimeoutMs: (capMs, reserveMs = 0) =>
      Math.max(0, Math.min(capMs, remainingMs() - reserveMs)),
  };
}
