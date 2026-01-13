/**
 * Token counting utility for LLM agent operations.
 *
 * Provides accurate token counting using tiktoken BPE tokenization
 * instead of character-based approximations.
 */

import { encoding_for_model, get_encoding, type Tiktoken } from 'tiktoken';

/**
 * Default model to use for tokenization.
 * Uses cl100k_base encoding which works for GPT-4, GPT-3.5-turbo, and most modern models.
 */
const DEFAULT_MODEL = 'gpt-4o';

/**
 * Singleton encoder cache to avoid recreating encoders.
 */
let cachedEncoder: Tiktoken | null = null;
let encoderModel: string | null = null;

/**
 * Gets or creates a cached encoder for the specified model.
 *
 * @param model - Model name for encoding selection
 * @returns Tiktoken encoder instance
 */
function getEncoder(model: string = DEFAULT_MODEL): Tiktoken {
  // Return cached encoder if available and for the same model
  if (cachedEncoder && encoderModel === model) {
    return cachedEncoder;
  }

  // Free previous encoder if exists
  if (cachedEncoder) {
    cachedEncoder.free();
  }

  // Create new encoder
  try {
    cachedEncoder = encoding_for_model(model as any);
    encoderModel = model;
  } catch {
    // Fallback to cl100k_base if model not found
    cachedEncoder = get_encoding('cl100k_base');
    encoderModel = 'cl100k_base';
  }

  return cachedEncoder;
}

/**
 * Counts the number of tokens in a text string using BPE tokenization.
 *
 * This provides accurate token counts for LLM context planning,
 * replacing the previous character-based approximations.
 *
 * @param text - Text to count tokens for
 * @param model - Model name for encoding (default: 'gpt-4o')
 * @returns Number of tokens in the text
 *
 * @example
 * ```typescript
 * import { countTokens } from './tokenizer.js';
 *
 * const tokens = countTokens('Hello, world!');
 * console.log(tokens); // 4
 * ```
 */
export function countTokens(text: string, model: string = DEFAULT_MODEL): number {
  // Handle edge cases
  if (!text || typeof text !== 'string') {
    return 0;
  }

  if (text.length === 0) {
    return 0;
  }

  try {
    const encoder = getEncoder(model);
    const tokens = encoder.encode(text);
    return tokens.length;
  } catch (error) {
    throw new Error(`Failed to count tokens: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Counts tokens for multiple texts efficiently using a single encoder.
 *
 * @param texts - Array of texts to count tokens for
 * @param model - Model name for encoding (default: 'gpt-4o')
 * @returns Array of token counts
 *
 * @example
 * ```typescript
 * import { countTokensBatch } from './tokenizer.js';
 *
 * const counts = countTokensBatch(['Hello', 'world'], 'gpt-4o');
 * console.log(counts); // [1, 1]
 * ```
 */
export function countTokensBatch(texts: string[], model: string = DEFAULT_MODEL): number[] {
  if (!texts || texts.length === 0) {
    return [];
  }

  try {
    const encoder = getEncoder(model);
    return texts.map(text => {
      if (!text || typeof text !== 'string') return 0;
      const tokens = encoder.encode(text);
      return tokens.length;
    });
  } catch (error) {
    throw new Error(`Failed to count tokens in batch: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Frees the cached encoder.
 *
 * Call this when shutting down the application to properly release memory.
 * This is handled automatically if a new encoder is created.
 */
export function freeEncoder(): void {
  if (cachedEncoder) {
    cachedEncoder.free();
    cachedEncoder = null;
    encoderModel = null;
  }
}
