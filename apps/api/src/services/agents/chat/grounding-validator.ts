/**
 * Grounding validator for chat responses.
 *
 * Validates that responses are properly grounded in provided sources
 * with appropriate citations.
 */

import type { ReferenceChunk } from '../../storage/ChatHistoryService.js';

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
