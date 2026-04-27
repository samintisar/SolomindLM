/**
 * AI service dependency detection for E2E tests.
 *
 * Tier 1 tests (no AI) always run.
 * Tier 2-3 (embeddings, LLM) require E2E_AI_ENABLED=1 in all environments,
 * or they hang waiting for model responses and fail with long timeouts.
 */
export function shouldSkipAITests(): boolean {
  return !process.env.E2E_AI_ENABLED;
}
