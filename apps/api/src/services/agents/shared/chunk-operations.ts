/**
 * Chunk operations utility for LLM agent processing.
 *
 * Provides intelligent chunk packing and validation to optimize
 * LLM API calls while preserving content integrity.
 */

/**
 * Configuration for chunk operations.
 */
export interface ChunkConfig {
  /** Target size in characters for packed chunks */
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
const DEFAULT_CHUNK_CONFIG: Required<Omit<ChunkConfig, 'targetSize' | 'agentName'>> = {
  minChunkLength: 50,
  maxChunkLength: 50000,
  separator: '\n\n',
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
export function packChunks(
  chunks: string[],
  config: ChunkConfig
): string[] {
  if (!chunks || chunks.length === 0) return [];

  const fullConfig = { ...DEFAULT_CHUNK_CONFIG, ...config };
  const { targetSize, separator, agentName = 'Agent' } = fullConfig;

  console.log(`\n[${agentName}] ===== CHUNK PACKING =====`);
  console.log(`[${agentName}] Original chunks: ${chunks.length}`);
  console.log(`[${agentName}] Target size: ${targetSize} chars per packed chunk`);

  const packed: string[] = [];
  const buffer: string[] = [];
  let bufferSize = 0;

  for (const chunk of chunks) {
    if (!chunk?.trim()) continue;

    // Calculate size with separator if not first item in buffer
    const chunkSize = chunk.length + (buffer.length > 0 ? separator.length : 0);

    // If adding this chunk would exceed target size, flush buffer
    if (bufferSize + chunkSize > targetSize && buffer.length > 0) {
      packed.push(buffer.join(separator));
      buffer.splice(0); // Properly clear array references
      bufferSize = 0;
    }

    buffer.push(chunk);
    bufferSize += chunkSize;
  }

  // Flush remaining buffer
  if (buffer.length > 0) {
    packed.push(buffer.join(separator));
  }

  const reduction = Math.round((1 - packed.length / chunks.length) * 100);
  console.log(`[${agentName}] Packed into: ${packed.length} chunks (${reduction}% fewer API calls)`);

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
export function validateChunks(
  chunks: string[],
  config: ChunkConfig
): string[] {
  if (!chunks || chunks.length === 0) return [];

  const fullConfig = { ...DEFAULT_CHUNK_CONFIG, ...config };
  const { minChunkLength, maxChunkLength, agentName = 'Agent' } = fullConfig;

  console.log(`\n[${agentName}] ===== INPUT VALIDATION =====`);
  console.log(`[${agentName}] Input chunks: ${chunks.length}`);

  const validated = chunks
    // Filter out invalid types
    .filter(c => c && typeof c === 'string')
    // Truncate oversized chunks
    .map(c => c.slice(0, maxChunkLength))
    // Filter out chunks that are too short
    .filter(c => c.trim().length >= minChunkLength);

  console.log(`[${agentName}] Valid chunks: ${validated.length}`);
  console.log(`[${agentName}] Filtered out: ${chunks.length - validated.length} (too short or invalid)`);

  return validated;
}

/**
 * Calculates optimal chunk size based on content characteristics.
 *
 * @param totalChars - Total character count of all content
 * @param targetChunkCount - Desired number of output chunks
 * @returns Optimal chunk size in characters
 *
 * @example
 * ```typescript
 * const optimalSize = calculateOptimalChunkSize(100000, 5);
 * // Returns 20000 (100k chars / 5 chunks)
 * ```
 */
export function calculateOptimalChunkSize(
  totalChars: number,
  targetChunkCount: number
): number {
  if (targetChunkCount <= 0) {
    throw new Error('targetChunkCount must be greater than 0');
  }

  return Math.ceil(totalChars / targetChunkCount);
}

/**
 * Splits content into chunks while respecting sentence boundaries.
 *
 * @param content - Content to split
 * @param maxChunkSize - Maximum size per chunk in characters
 * @returns Array of content chunks
 *
 * @example
 * ```typescript
 * const chunks = splitBySentenceBoundaries(
 *   'Long text here...',
 *   5000
 * );
 * ```
 */
export function splitBySentenceBoundaries(
  content: string,
  maxChunkSize: number
): string[] {
  const chunks: string[] = [];
  let currentChunk = '';

  // Sentence boundary patterns (period, exclamation, question mark followed by space)
  const sentenceRegex = /(.+?[.!?])(\s|$)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = sentenceRegex.exec(content)) !== null) {
    const sentence = match[0];
    const wouldExceedLimit = currentChunk.length + sentence.length > maxChunkSize;

    if (wouldExceedLimit && currentChunk.length > 0) {
      // Flush current chunk
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      // Add to current chunk
      currentChunk += sentence;
    }

    lastIndex = sentenceRegex.lastIndex;
  }

  // Add remaining content
  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex);
    if (currentChunk.length + remaining.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = remaining;
    } else {
      currentChunk += remaining;
    }
  }

  // Push final chunk
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Estimates token count from character count.
 * Conservative estimation: ~3 characters per token.
 *
 * @param text - Text to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

/**
 * Gets a preview of a chunk for logging/debugging.
 *
 * @param chunk - Chunk to preview
 * @param maxLength - Maximum preview length (default: 100)
 * @returns Preview string with length info
 */
export function getChunkPreview(chunk: string, maxLength: number = 100): string {
  const cleaned = chunk.replace(/\n/g, ' ');
  if (cleaned.length <= maxLength) {
    return `[${chunk.length} chars] "${cleaned}"`;
  }

  const start = cleaned.substring(0, maxLength / 2);
  const end = cleaned.substring(Math.max(0, cleaned.length - maxLength / 2));

  return `[${chunk.length} chars] "${start}..."..."${end}"`;
}
