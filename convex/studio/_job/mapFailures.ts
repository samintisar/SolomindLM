/**
 * How Studio map/reduce jobs treat map chunks that fail.
 *
 * A failed chunk is rescheduled a few times with a growing delay before it is recorded as failed,
 * so a burst of provider errors (rate limits, credit limits, timeouts) doesn't punch holes in the
 * output. If a large share of chunks still fails, the item fails instead of completing without
 * that part of the sources.
 */

/** Attempts per map chunk, the first included. Each attempt is its own action. */
export const MAP_CHUNK_MAX_ATTEMPTS = 3;

/** Delay before re-running a failed chunk: 20 s, then 40 s. */
const MAP_CHUNK_RETRY_BASE_DELAY_MS = 20_000;

/** Above this share of failed chunks the item fails rather than completing partially. */
export const MAX_MAP_FAILURE_SHARE = 0.1;

/**
 * The delay before the next attempt of a chunk that just failed on `attempt` (1-based), or null
 * when it has used all its attempts and should be recorded as failed.
 */
export function mapChunkRetryDelayMs(attempt: number | undefined): number | null {
  const current = attempt ?? 1;
  if (current >= MAP_CHUNK_MAX_ATTEMPTS) return null;
  return MAP_CHUNK_RETRY_BASE_DELAY_MS * 2 ** (current - 1);
}

/** Share of chunks that failed, rounded to three places, for job logs. */
export function mapFailureRate(totalChunks: number, failedChunks: number): number {
  if (totalChunks <= 0) return 0;
  return Math.round((failedChunks / totalChunks) * 1000) / 1000;
}

/** True when too many chunks failed for the item to count as complete. */
export function tooManyMapFailures(totalChunks: number, failedChunks: number): boolean {
  if (totalChunks <= 0 || failedChunks <= 0) return false;
  return failedChunks / totalChunks > MAX_MAP_FAILURE_SHARE;
}

/** Thrown from a finalize phase when too many chunks failed; its message is shown to the user. */
export class TooManyMapFailuresError extends Error {
  constructor(
    readonly totalChunks: number,
    readonly failedChunks: number
  ) {
    super(
      `${failedChunks} of ${totalChunks} source sections couldn't be processed, so the result would leave out part of your sources. Please try again.`
    );
    this.name = "TooManyMapFailuresError";
  }
}

/** Throws `TooManyMapFailuresError` when too many chunks failed. */
export function assertMapFailuresAcceptable(totalChunks: number, failedChunks: number): void {
  if (tooManyMapFailures(totalChunks, failedChunks)) {
    throw new TooManyMapFailuresError(totalChunks, failedChunks);
  }
}
