"use node";
/**
 * Chunk operations utility for LLM agent processing.
 *
 * Provides intelligent chunk packing and validation to optimize
 * LLM API calls while preserving content integrity.
 */

import { countTokens } from "./tokenizer.js";

/**
 * Configuration for chunk operations.
 */
export interface ChunkConfig {
  /** Target size in tokens for packed chunks */
  targetSize: number;
  /** Minimum length in characters for valid chunks (default: 50) */
  minChunkLength?: number;
  /** Maximum length in characters for chunks (default: 50000) */
  maxChunkLength?: number;
  /** Separator between chunks (default: '\n\n') */
  separator?: string;
  /** Agent name for logging (default: 'Agent') */
  agentName?: string;
}

/**
 * Default chunk configuration.
 */
const DEFAULT_CHUNK_CONFIG: Required<Omit<ChunkConfig, "targetSize" | "agentName">> = {
  minChunkLength: 50,
  maxChunkLength: 50000,
  separator: "\n\n",
};

/**
 * Packs small chunks into larger chunks to optimize API calls.
 *
 * This function intelligently combines smaller chunks into larger ones
 * that fit within the target size, reducing the number of API calls
 * while preserving content boundaries.
 *
 * @param chunks - Array of text chunks to pack
 * @param config - Chunk configuration
 * @returns Array of packed chunks
 *
 * @example
 * ```typescript
 * const packed = packChunks(
 *   ['chunk1', 'chunk2', 'chunk3', ...],
 *   { targetSize: 20000, agentName: 'FlashcardGraph' }
 * );
 * // Results in fewer, larger chunks optimized for API calls
 * ```
 */
export function packChunks(chunks: string[], config: ChunkConfig): string[] {
  if (!chunks || chunks.length === 0) return [];

  const fullConfig = { ...DEFAULT_CHUNK_CONFIG, ...config };
  const { targetSize, separator, agentName = "Agent" } = fullConfig;

  console.log(`\n[${agentName}] ===== CHUNK PACKING =====`);
  console.log(`[${agentName}] Original chunks: ${chunks.length}`);
  console.log(`[${agentName}] Target size: ${targetSize} tokens per packed chunk`);

  const packed: string[] = [];
  const buffer: string[] = [];
  let bufferTokens = 0;

  for (const chunk of chunks) {
    if (!chunk?.trim()) continue;

    // Calculate tokens with separator if not first item in buffer
    const chunkTokens = countTokens(chunk);
    const separatorTokens = buffer.length > 0 ? countTokens(separator) : 0;
    const totalTokens = chunkTokens + separatorTokens;

    // If adding this chunk would exceed target size, flush buffer
    if (bufferTokens + totalTokens > targetSize && buffer.length > 0) {
      packed.push(buffer.join(separator));
      buffer.splice(0); // Properly clear array references
      bufferTokens = 0;
    }

    buffer.push(chunk);
    bufferTokens += totalTokens;
  }

  // Flush remaining buffer
  if (buffer.length > 0) {
    packed.push(buffer.join(separator));
  }

  const reduction = Math.round((1 - packed.length / chunks.length) * 100);
  console.log(
    `[${agentName}] Packed into: ${packed.length} chunks (${reduction}% fewer API calls)`
  );

  return packed;
}

/**
 * Validates and filters chunks to ensure they meet quality standards.
 *
 * This function removes invalid chunks, truncates oversized chunks,
 * and filters out chunks that are too short to be useful.
 *
 * @param chunks - Array of text chunks to validate
 * @param config - Chunk configuration
 * @returns Array of validated chunks
 *
 * @example
 * ```typescript
 * const validated = validateChunks(
 *   ['chunk1', 'tiny', 'chunk3', ...],
 *   { minChunkLength: 50, maxChunkLength: 50000, agentName: 'FlashcardGraph' }
 * );
 * // Returns only chunks that meet quality standards
 * ```
 */
export function validateChunks(chunks: string[], config: ChunkConfig): string[] {
  if (!chunks || chunks.length === 0) return [];

  const fullConfig = { ...DEFAULT_CHUNK_CONFIG, ...config };
  const { minChunkLength, maxChunkLength, agentName = "Agent" } = fullConfig;

  console.log(`\n[${agentName}] ===== INPUT VALIDATION =====`);
  console.log(`[${agentName}] Input chunks: ${chunks.length}`);

  const validated = chunks
    // Filter out invalid types
    .filter((c) => c && typeof c === "string")
    // Truncate oversized chunks
    .map((c) => c.slice(0, maxChunkLength))
    // Filter out chunks that are too short
    .filter((c) => c.trim().length >= minChunkLength);

  console.log(`[${agentName}] Valid chunks: ${validated.length}`);
  console.log(
    `[${agentName}] Filtered out: ${chunks.length - validated.length} (too short or invalid)`
  );

  return validated;
}
