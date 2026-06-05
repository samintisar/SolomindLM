import { env } from "../_lib/env.js";

/** Papers sent to screening after rerank (limits downstream LLM cost). */
export const LITERATURE_SCREEN_TOP_N = 25;

/** Max characters of abstract sent to screening / extraction prompts. */
export const LITERATURE_ABSTRACT_MAX_CHARS = 1_200;

/** Parallel Together calls per screening or extraction batch action. */
export const LITERATURE_BULK_LLM_CONCURRENCY = 4;

export function truncateForLiteratureLlm(
  text: string,
  maxChars: number = LITERATURE_ABSTRACT_MAX_CHARS
): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars)}…`;
}

/** High-throughput steps use the env fast model, not the notebook smart model. */
export function bulkLlmModel(): string {
  return env.FAST_LLM;
}
