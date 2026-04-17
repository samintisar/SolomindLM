"use node";
/**
 * Grounding validator for chat responses.
 *
 * Validates that responses are properly grounded in provided sources
 * with appropriate citations.
 */

import type { ReferenceChunk } from "../../storage/ChatHistoryService";
import type { EmbeddingService } from "../../_services/processing/EmbeddingServiceClient";
import { matchAllInlineCitations, stripInlineCitationMarkers } from "../_shared/citationExtract.js";

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
 * Semantic similarity threshold for grounding validation.
 * Configurable via GROUNDING_SIMILARITY_THRESHOLD (see convex/_lib/env.ts).
 * - OpenAI text-embedding-3-small: ~0.30 default is more lenient for long, paraphrased answers
 */
const DEFAULT_GROUNDING_THRESHOLD = 0.3;
const GROUNDING_THRESHOLD = parseFloat(
  process.env.GROUNDING_SIMILARITY_THRESHOLD ?? String(DEFAULT_GROUNDING_THRESHOLD)
);

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
  "i think",
  "probably",
  "might be",
  "could be",
  "it seems",
  "maybe",
  "i believe",
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

  // Check for citations ([1] or mistaken LaTeX \[1\])
  const citations = matchAllInlineCitations(response);

  if (citations.length === 0) {
    issues.push("No citations found in response");
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

  // Low citation coverage is a warning only, not a hard grounding failure.
  // The LLM correctly ignores irrelevant chunks, so don't penalise it for citing fewer sources.
  const lowCoverage = sources.length > 3 && seenIds.size < Math.ceil(sources.length * 0.3);

  return {
    // Only fail on hard issues (no citations, invalid IDs, uncertain language).
    // Low coverage is informational and must not trigger a costly retry.
    isGrounded: issues.length === 0,
    missingCitations: citations.length === 0,
    issues: lowCoverage
      ? [...issues, `Note: Only ${seenIds.size} of ${sources.length} sources cited`]
      : issues,
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
  if (trimmed.startsWith("[")) {
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
    throw new Error("Vector dimensions must match");
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
 * Validates semantic grounding with a single whole-response similarity check.
 *
 * Instead of embedding every sentence (expensive: ~N*2 API calls), we embed:
 *   - The full response text (once)
 *   - The combined cited source content (once)
 * and compute one cosine similarity. This cuts embedding cost from O(sentences)
 * to O(1) — 2 API calls instead of ~60.
 *
 * @param response - The response text to validate
 * @param sources - The source chunks that were used
 * @param embeddingService - Embedding service for computing similarities
 * @returns Promise resolving to grounding validation result
 */
export async function validateSemanticGrounding(
  response: string,
  sources: ReferenceChunk[],
  embeddingService: EmbeddingService
): Promise<GroundingValidationResult> {
  const issues: string[] = [];

  // Determine which sources are actually cited in the response
  const citedIds = matchAllInlineCitations(response)
    .map((m) => parseInt(m[1]))
    .filter((id) => id >= 1 && id <= sources.length);

  const uniqueCitedIds = [...new Set(citedIds)];

  // If there are no citations at all, semantic grounding can't be assessed
  if (uniqueCitedIds.length === 0) {
    return { isGrounded: true, missingCitations: false, issues: [] };
  }

  // Build combined source text from cited chunks only (up to 3000 chars per chunk)
  const citedSourceText = uniqueCitedIds
    .map((id) => sources[id - 1]?.content?.slice(0, 3000))
    .filter(Boolean)
    .join("\n\n");

  if (!citedSourceText) {
    return { isGrounded: true, missingCitations: false, issues: [] };
  }

  // Strip citation markers from response for cleaner embedding
  const cleanResponse = stripInlineCitationMarkers(response);

  console.log(
    `[SemanticGrounding] Whole-response check: ${uniqueCitedIds.length} cited sources, ` +
      `response=${cleanResponse.length} chars, sources=${citedSourceText.length} chars`
  );

  try {
    const [responseEmbed, sourceEmbed] = await Promise.all([
      embeddingService.embedText(truncateForEmbedding(cleanResponse)),
      embeddingService.embedText(truncateForEmbedding(citedSourceText)),
    ]);

    const similarity = cosineSimilarity(responseEmbed, sourceEmbed);
    console.log(
      `[SemanticGrounding] Whole-response similarity: ${similarity.toFixed(3)} (threshold: ${GROUNDING_THRESHOLD})`
    );

    if (similarity < GROUNDING_THRESHOLD) {
      issues.push(
        `Response may not be grounded in cited sources (similarity: ${similarity.toFixed(2)}, threshold: ${GROUNDING_THRESHOLD})`
      );
    }
  } catch (error) {
    console.error("[SemanticGrounding] Embedding computation failed:", error);
    // Don't fail validation on embedding errors
  }

  return {
    isGrounded: issues.length === 0,
    missingCitations: false,
    issues,
  };
}
