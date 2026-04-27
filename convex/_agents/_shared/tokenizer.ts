"use node";
/**
 * Token counting utility for LLM agent operations.
 *
 * Uses a character-based estimate (~4 chars per token for English) to avoid
 * the large js-tiktoken dependency. Good enough for chunk sizing and limits.
 */

/** Approximate characters per token for English (GPT-style models). */
const CHARS_PER_TOKEN = 4;

/**
 * Default model (kept for API compatibility; estimate is model-agnostic).
 */
const DEFAULT_MODEL = "gpt-4o";

/**
 * Estimates the number of tokens in a text using character count.
 * Uses ~4 chars/token for English; safe for chunk sizing and limits.
 *
 * @param text - Text to count tokens for
 * @param _model - Ignored; kept for API compatibility
 * @returns Estimated number of tokens
 */
export function countTokens(text: string, _model: string = DEFAULT_MODEL): number {
  if (!text || typeof text !== "string") {
    return 0;
  }
  if (text.length === 0) {
    return 0;
  }
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimates tokens for multiple texts.
 *
 * @param texts - Array of texts to count tokens for
 * @param model - Ignored; kept for API compatibility
 * @returns Array of estimated token counts
 */
export function countTokensBatch(texts: string[], model: string = DEFAULT_MODEL): number[] {
  if (!texts || texts.length === 0) {
    return [];
  }
  return texts.map((text) => (text && typeof text === "string" ? countTokens(text, model) : 0));
}

/**
 * Truncates text to fit within max tokens (character-based).
 *
 * @param text - Text to truncate
 * @param maxTokens - Maximum number of tokens
 * @param _model - Ignored; kept for API compatibility
 * @returns Truncated text
 */
export function truncateToTokens(
  text: string,
  maxTokens: number,
  _model: string = DEFAULT_MODEL,
  /** Tighter = safer when real tokenizers exceed len/4 (dense code, CJK, etc.) */
  charsPerToken: number = CHARS_PER_TOKEN
): string {
  if (!text || maxTokens <= 0) {
    return "";
  }
  const maxChars = maxTokens * charsPerToken;
  if (text.length <= maxChars) {
    return text;
  }
  const truncated = text.slice(0, maxChars);
  // Prefer cutting at last space to avoid mid-word
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxChars * 0.8) {
    return truncated.slice(0, lastSpace).trim();
  }
  return truncated;
}

/**
 * No-op; kept for API compatibility (previously freed js-tiktoken encoder).
 */
export function freeEncoder(): void {
  // no-op
}
