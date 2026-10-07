/**
 * Turnstile error families 300xxx and 600xxx mean the challenge ran and the browser failed it,
 * as opposed to the script being blocked or timing out. `useTurnstile` rejects with
 * `turnstile_<code>` from its error callback.
 */
const CHALLENGE_FAILURE = /^turnstile_[36]\d{5}$/;

export function isTurnstileChallengeFailure(error: unknown): boolean {
  return error instanceof Error && CHALLENGE_FAILURE.test(error.message);
}
