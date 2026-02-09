"use node"
/**
 * Grounding validator for chat responses.
 *
 * Validates that responses are properly grounded in provided sources
 * with appropriate citations.
 */

import type { ReferenceChunk } from '../../../storage/ChatHistoryService';
import type { EmbeddingService } from '../../processing/EmbeddingServiceClient';

// ============================================================
// Types
// ============================================================

/**
 * Result of grounding validation.
 */
export interface GroundingValidationResult {
  /** Whether the response is properly grounded */
  isGrounded: boolean;
  /** Whether the response is missing citations */
  missingCitations: boolean;
  /** List of issues found during validation */
  issues: string[];
}

// ============================================================
// Constants
// ============================================================

/**
 * text-embedding-3-small has max 8192 tokens (~4 chars/token).
 * Truncate to stay under limit and avoid BadRequestError.
 */
const MAX_EMBED_CHARS = 24_000; // ~6000 tokens

function truncateForEmbedding(text: string): string {
  if (text.length <= MAX_EMBED_CHARS) return text;
  return text.slice(0, MAX_EMBED_CHARS);
}

/**
 * Phrases that indicate uncertainty and should trigger warnings.
 */
const UNCERTAIN_PHRASES = [
  'i think',
  'probably',
  'might be',
  'could be',
  'it seems',
  'perhaps',
  'maybe',
  'likely',
  'possibly',
  'i believe',
  'appears to be',
] as const;

// ============================================================
// Validation Functions
// ============================================================

/**
 * Validates that a response is grounded in provided sources.
 *
 * Checks for:
 * - Presence of citations
 * - Valid citation IDs
 * - Absence of uncertain language
 * - Adequate source coverage
 *
 * @param response - The response text to validate
 * @param sources - The source chunks that were used
 * @returns Grounding validation result
 *
 * @example
 * ```typescript
 * const validation = validateGrounding(responseText, sourceChunks);
 * if (!validation.isGrounded) {
 *   console.warn('Grounding issues:', validation.issues);
 * }
 * ```
 */
export function validateGrounding(
  response: string,
  sources: ReferenceChunk[]
): GroundingValidationResult {
  const issues: string[] = [];

  // Check for citations
  const citationPattern = /\[(\d+)\]/g;
  const citations = [...response.matchAll(citationPattern)];

  if (citations.length === 0) {
    issues.push('No citations found in response');
  }

  // Verify cited IDs exist
  const maxId = sources.length;
  const seenIds = new Set<number>();

  for (const match of citations) {
    const id = parseInt(match[1]);
    if (id > maxId || id < 1) {
      issues.push(`Invalid citation [${id}] - only ${maxId} sources provided`);
    }
    seenIds.add(id);
  }

  // Check for hedging phrases that indicate uncertainty
  const lowerResponse = response.toLowerCase();
  for (const phrase of UNCERTAIN_PHRASES) {
    if (lowerResponse.includes(phrase)) {
      issues.push(`Response contains uncertain language: "${phrase}"`);
      break; // Only report first instance
    }
  }

  // Check if very few sources were used (less than 30% - warning level)
  // If only 3 of 7 sources are relevant, LLM should only cite those 3
  if (sources.length > 3 && seenIds.size < Math.ceil(sources.length * 0.3)) {
    issues.push(
      `Warning: Only ${seenIds.size} of ${sources.length} sources were cited (consider reviewing relevance)`
    );
  }

  return {
    isGrounded: issues.length === 0,
    missingCitations: citations.length === 0,
    issues,
  };
}

/**
 * Checks if content is an artifact that should be filtered from user-facing output.
 *
 * Artifacts include:
 * - Empty content
 * - JSON arrays (likely structured output)
 * - Reference section headers
 * - Tool output patterns
 *
 * @param content - The content to check
 * @returns True if content is an artifact
 *
 * @example
 * ```typescript
 * if (isArtifactContent(chunk)) {
 *   continue; // Skip this chunk
 * }
 * ```
 */
export function isArtifactContent(content: string): boolean {
  const trimmed = content.trim();

  // Skip empty content
  if (trimmed.length === 0) {
    return true;
  }

  // Check if it's a valid JSON array (try parsing)
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return true; // Valid JSON array - likely an artifact
      }
    } catch {
      // Not valid JSON, continue checking
    }
  }

  // Check for reference section headers
  const referenceHeaders = /^(references|sources|citations|bibliography):\s*$/i;
  if (referenceHeaders.test(trimmed)) {
    return true;
  }

  // Check for tool output pattern (has known keys from our schema)
  const toolOutputPattern = /"(id|sourceTitle|chunkIndex|similarity)":\s*"/;
  if (toolOutputPattern.test(trimmed)) {
    return true;
  }

  return false;
}

// ============================================================
// Semantic Grounding Validation
// ============================================================

/**
 * Cosine similarity between two vectors.
 */
function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error('Vector dimensions must match');
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * Validates semantic grounding by checking if cited content actually supports the claims.
 * Uses embedding similarity to verify that claims are grounded in their cited sources.
 *
 * @param response - The response text to validate
 * @param sources - The source chunks that were used
 * @param embeddingService - Embedding service for computing similarities
 * @returns Promise resolving to grounding validation result
 *
 * @example
 * ```typescript
 * const validation = await validateSemanticGrounding(responseText, sourceChunks, embeddingService);
 * if (!validation.isGrounded) {
 *   console.warn('Semantic grounding issues:', validation.issues);
 * }
 * ```
 */
export async function validateSemanticGrounding(
  response: string,
  sources: ReferenceChunk[],
  embeddingService: EmbeddingService
): Promise<GroundingValidationResult> {
  const issues: string[] = [];
  const citationPattern = /\[(\d+)\]/g;

  // Split response into sentences
  const sentences = response
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20); // Skip very short fragments

  console.log(`[SemanticGrounding] Validating ${sentences.length} sentences against ${sources.length} sources`);

  for (const sentence of sentences) {
    // Find citations in this sentence
    const citationMatches = [...sentence.matchAll(citationPattern)];
    if (citationMatches.length === 0) continue;

    // Extract cited source IDs (1-indexed)
    const citedIds = citationMatches.map((c) => parseInt(c[1])).filter((id) => id >= 1 && id <= sources.length);

    if (citedIds.length === 0) {
      issues.push(`Sentence cites invalid source IDs: "${sentence.slice(0, 50)}..."`);
      continue;
    }

    // Get the cited source content
    const citedContent = citedIds.map((id) => sources[id - 1]?.content).filter(Boolean).join(' ');

    if (!citedContent) {
      issues.push(`Sentence cites sources with no content: "${sentence.slice(0, 50)}..."`);
      continue;
    }

    try {
      // Compute embedding similarity to verify claim is grounded.
      // Truncate to stay under model context limit (8192 tokens).
      const sentenceTrunc = truncateForEmbedding(sentence);
      const citedTrunc = truncateForEmbedding(citedContent);
      const sentenceEmbed = await embeddingService.embedText(sentenceTrunc);
      const sourceEmbed = await embeddingService.embedText(citedTrunc);

      const similarity = cosineSimilarity(sentenceEmbed, sourceEmbed);
      const threshold = 0.38; // Semantic similarity threshold (relaxed from 0.45 to reduce false positives)

      if (similarity < threshold) {
        issues.push(
          `Sentence "${sentence.slice(0, 60)}..." cites sources [${citedIds.join(', ')}] but claim may not be grounded (similarity: ${similarity.toFixed(2)})`
        );
      } else {
        console.log(`[SemanticGrounding] Sentence validated (similarity: ${similarity.toFixed(2)})`);
      }
    } catch (error) {
      console.error('[SemanticGrounding] Embedding computation failed:', error);
      // Don't fail validation on embedding errors, just log and continue
    }
  }

  return {
    isGrounded: issues.length === 0,
    missingCitations: false, // Semantic validation doesn't check for missing citations
    issues,
  };
}
