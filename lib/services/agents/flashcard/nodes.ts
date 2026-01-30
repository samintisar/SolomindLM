"use node"
/**
 * Node functions and main class for FlashcardGraph.
 *
 * Contains all node logic for split_chunks, map_process, collapse,
 * and reduce phases, along with the main FlashcardGraph class.
 */

import { StateGraph, START, END, Send } from '@langchain/langgraph';
import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { env } from '../../../helpers/env';

// Shared utilities for production-level patterns
import {
  invokeWithTimeout,
  invokeWithRetry,
  packChunks as sharedPackChunks,
  validateChunks as sharedValidateChunks,
  logInfo,
  logWarn,
  logError,
  logPhaseStart,
  logPhaseComplete,
  logBanner,
  sanitizeUserInput,
  validateFlashcards,
  countTokens,
  clearStateKeys,
  createLangSmithRunConfig,
} from '../shared/index.js';

// Import from local modules
import { OverallState, type OverallStateType, type ChunkProcessState, type Flashcard } from './state.js';
import { getMapPrompt, getReducePrompt, PROBLEMATIC_PHRASES, FlashcardArraySchema, type FlashcardResponse, MAP_SYSTEM_PROMPT, COLLAPSE_SYSTEM_PROMPT, REDUCE_SYSTEM_PROMPT } from './prompts.js';

// ============================================================
// STRUCTURED OUTPUT SCHEMAS
// ============================================================

/**
 * Interface for the structured LLM to avoid deep type instantiation.
 * Follows the pattern from ReportGraph.
 */
interface FlashcardOutputInvoker {
  invoke(messages: Array<SystemMessage | HumanMessage>): Promise<FlashcardResponse>;
}

/**
 * Helper function to create a structured LLM without triggering deep type instantiation.
 * TypeScript tries to infer the full generic chain of withStructuredOutput, which exceeds
 * its recursion limits. We use a local any cast to break this chain while preserving
 * type safety through the FlashcardOutputInvoker interface.
 * Follows the pattern from ReportGraph.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createStructuredLLM(llm: ChatTogetherAI, schema: z.ZodTypeAny): FlashcardOutputInvoker {
  // @ts-ignore - Type instantiation is excessively deep with LangChain's withStructuredOutput
  return llm.withStructuredOutput(schema, {
    name: 'flashcard_array'
  }) as any;
}

// ============================================================
// CONFIGURATION
// ============================================================

const FLASHCARD_CONFIG = {
  // Map phase: fast_llm (131K tokens) → 7.5K tokens (~6% of context)
  MAP_CHUNK_SIZE_TOKENS: parseInt(env.FLASHCARD_MAP_CHUNK_TOKENS || '7500', 10),
  // Reduce phase: smart_llm (261K tokens) → 15K tokens (~6% of context)
  REDUCE_CHUNK_SIZE_TOKENS: parseInt(env.FLASHCARD_REDUCE_CHUNK_TOKENS || '15000', 10),
  // Timeout settings for LLM calls
  MAP_TIMEOUT_MS: parseInt(env.FLASHCARD_MAP_TIMEOUT_MS || '180000', 10), // 3 minutes
  REDUCE_TIMEOUT_MS: parseInt(env.FLASHCARD_REDUCE_TIMEOUT_MS || '240000', 10), // 4 minutes
  // Max tokens for reduce phase (selection/refinement) - needed for large flashcard sets
  REDUCE_MAX_TOKENS: parseInt(env.FLASHCARD_REDUCE_MAX_TOKENS || '32000', 10), // Enough for 55+ flashcards in JSON
} as const;

const GRAPH_CONFIG = {
  ...FLASHCARD_CONFIG,
} as const;

// ============================================================
// TEXT CLEANING UTILITIES
// ============================================================

/**
 * Cleans up the front text by removing formatting artifacts.
 * Enhanced to handle escaped quotes and markdown issues.
 */
function cleanFrontText(front: string): string {
  let cleaned = front.trim();

  // Remove escaped quotes (\"pure\" → "pure")
  cleaned = cleaned.replace(/\\"/g, '"');

  // Remove trailing markdown formatting artifacts
  cleaned = cleaned.replace(/\s*[*_~]{1,2}\s*$/, '');

  // Remove trailing enumeration numbers
  cleaned = cleaned.replace(/\s*\d+\.\s*$/, '');

  // Remove trailing whitespace
  cleaned = cleaned.trim();

  // Fix common markdown issues
  cleaned = cleaned.replace(/\*\*\s*\*/g, '**'); // Fix ** *
  cleaned = cleaned.replace(/\*\s*\*/g, '**');   // Fix * *

  // Remove leading bullets if present
  cleaned = cleaned.replace(/^[\s\-•*]\*/, '');

  return cleaned.trim();
}

/**
 * Cleans up the back text by removing formatting artifacts.
 * Enhanced to handle escaped quotes and weird punctuation.
 */
function cleanBackText(back: string): string {
  let cleaned = back.trim();

  // Remove escaped quotes
  cleaned = cleaned.replace(/\\"/g, '"');

  // Remove trailing enumeration numbers
  cleaned = cleaned.replace(/\s*\d+\.\s*$/, '');

  // Remove markdown artifacts at end
  cleaned = cleaned.replace(/\s*[*_~]{1,2}\s*$/, '');

  // Fix common punctuation issues (e.g., "concept."")
  cleaned = cleaned.replace(/"\./g, '".');  // Fix ". scenarios
  cleaned = cleaned.replace(/\.\./g, '.');  // Fix double periods

  // Remove trailing punctuation that's clearly an artifact
  cleaned = cleaned.replace(/[,;:\s]+$/, '');

  // Clean up multiple spaces
  cleaned = cleaned.replace(/\s{2,}/g, ' ');

  return cleaned.trim();
}

// ============================================================
// CHUNK HELPERS
// ============================================================

/**
 * Wrapper around shared packChunks utility with FlashcardGraph logging.
 */
export function packChunks(chunks: string[], targetSize: number = FLASHCARD_CONFIG.MAP_CHUNK_SIZE_TOKENS): string[] {
  return sharedPackChunks(chunks, {
    targetSize,
    minChunkLength: 50,
    maxChunkLength: 50000,
    agentName: 'FlashcardGraph',
  });
}

/**
 * Wrapper around shared validateChunks utility with FlashcardGraph logging.
 */
export function validateChunks(chunks: string[]): string[] {
  return sharedValidateChunks(chunks, {
    targetSize: FLASHCARD_CONFIG.MAP_CHUNK_SIZE_TOKENS, // Not used for validation but required by interface
    minChunkLength: 50,
    maxChunkLength: 50000,
    agentName: 'FlashcardGraph',
  });
}

// ============================================================
// NODE FUNCTIONS
// ============================================================

/**
 * Helper function to call the status update callback.
 * Safely invokes the callback if it exists.
 */
async function callStatusUpdate(
  state: OverallStateType,
  phase: string
): Promise<void> {
  if (state.onStatusUpdate) {
    try {
      await state.onStatusUpdate(phase);
    } catch (error) {
      console.error('[FlashcardGraph] Status update callback error:', error);
    }
  }
}

/**
 * Node: Split chunks for routing
 */
async function splitChunks(state: OverallStateType): Promise<Partial<OverallStateType>> {
  // ============================================================
  // DEBUG: Input State Analysis
  // ============================================================
  console.log('\n' + '='.repeat(80));
  console.log('[FlashcardGraph] ===== SPLIT CHUNKS PHASE =====');
  console.log('='.repeat(80));
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    phase: 'split_chunks',
    documentCount: state.documentIds?.length || 0,
    documentIds: state.documentIds || [],
    chunkCount: state.chunks?.length || 0,
    targetCardCount: state.cardCount,
    difficulty: state.difficulty,
    topic: state.topic || 'none',
  }, null, 2));

  // Call status update callback
  await callStatusUpdate(state, 'split_chunks');

  return {
    ...state,
    status: 'mapping',
    mapOutputs: state.mapOutputs || [],
    collapsedOutputs: state.collapsedOutputs || [],
    finalOutput: state.finalOutput || [],
    progress: {
      phase: 'split_chunks',
      percentage: 5,
      message: `Preparing ${state.chunks?.length || 0} chunks for processing`,
      totalChunks: state.chunks?.length || 0,
    },
  };
}

/**
 * Conditional routing function - returns Send objects for fan-out or 'collapse' string
 */
function routeToMap(state: OverallStateType): Send[] | 'collapse' {
  // ============================================================
  // DEBUG: Routing Analysis
  // ============================================================
  console.log('\n' + '='.repeat(80));
  console.log('[FlashcardGraph] ===== ROUTE TO MAP PHASE =====');
  console.log('='.repeat(80));

  // If no chunks, skip to collapse
  if (state.chunks.length === 0) {
    console.warn('[FlashcardGraph] No chunks to process, routing to collapse');
    return 'collapse';
  }

  // Step 1: Validate chunks (filter out invalid/too-short)
  const validatedChunks = validateChunks(state.chunks);

  // Step 2: Pack chunks into optimal sizes for map phase (fast_llm)
  const packedChunks = packChunks(validatedChunks, GRAPH_CONFIG.MAP_CHUNK_SIZE_TOKENS);

  // Step 3: Calculate cards per chunk with buffer and reasonable max
  // LLMs can reliably generate 25-30 quality cards per call
  const MIN_CARDS_PER_CHUNK = 2;
  const BUFFER_MULTIPLIER = 1.5;
  const MAX_CARDS_PER_CHUNK = 30; // Reasonable LLM limit
  const cardsPerChunk = Math.max(
    MIN_CARDS_PER_CHUNK,
    Math.min(
      MAX_CARDS_PER_CHUNK,
      Math.ceil(state.cardCount / packedChunks.length * BUFFER_MULTIPLIER)
    )
  );

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    phase: 'route_to_map',
    originalChunks: state.chunks.length,
    validatedChunks: validatedChunks.length,
    packedChunks: packedChunks.length,
    targetCardCount: state.cardCount,
    cardsPerChunk,
    difficulty: state.difficulty,
    topic: state.topic,
  }, null, 2));

  console.log(`[FlashcardGraph] Creating ${packedChunks.length} parallel map tasks (~${cardsPerChunk} cards/chunk)`);

  // Create Send objects
  return packedChunks.map((chunk, idx) => {
    const preview = chunk.substring(0, 100).replace(/\n/g, ' ');
    console.log(`  [Task ${idx + 1}/${packedChunks.length}] ${preview}... (${chunk.length} chars)`);
    return new Send('map_process', {
      chunk,
      chunkIndex: idx,
      cardCount: state.cardCount,
      difficulty: state.difficulty,
      topic: state.topic,
      cardsPerChunk,
    });
  });
}

/**
 * Node: Map phase (runs in parallel via Send)
 * Uses structured output to generate JSON flashcards directly.
 */
async function mapProcess(
  state: ChunkProcessState,
  structuredLlm: FlashcardOutputInvoker
): Promise<Partial<OverallStateType>> {
  const { chunk, chunkIndex, cardCount, difficulty, topic, cardsPerChunk } = state;
  const startTime = Date.now();

  const chunkId = chunkIndex !== undefined ? `[Chunk ${chunkIndex + 1}]` : '[Chunk ?]';

  // Structured logging start
  logPhaseStart({
    agent: 'FlashcardGraph',
    phase: 'map_process',
    chunkIndex,
    chunkLength: chunk.length,
    chunkPreview: chunk.substring(0, 150).replace(/\n/g, ' '),
    targetCardCount: cardCount,
    cardsPerChunkTarget: cardsPerChunk,
    difficulty,
    topic: topic || 'none',
  });

  // Sanitize user input (topic)
  const sanitizedTopic = topic ? sanitizeUserInput(topic) : undefined;
  const prompt = getMapPrompt({ chunk, cardCount, cardsPerChunk, difficulty, topic: sanitizedTopic });

  logInfo({
    agent: 'FlashcardGraph',
    phase: 'map_process',
    chunkId,
    promptLength: prompt.length,
  }, `Sending prompt to LLM (${prompt.length} chars)...`);

  let output: string;
  try {
    // Timeout + Retry wrapper for resilient LLM calls
    const response = await invokeWithRetry(
      () => invokeWithTimeout(
        () => (structuredLlm as any).invoke([
          new SystemMessage(MAP_SYSTEM_PROMPT),
          new HumanMessage(prompt),
        ], createLangSmithRunConfig({
          runName: 'FlashcardGraph.MapProcess',
          tags: ['agent', 'flashcard', 'map'],
          metadata: {
            chunkIndex,
            cardCount,
            difficulty,
            topic: topic || 'none',
          },
        })),
        FLASHCARD_CONFIG.MAP_TIMEOUT_MS,
        'FlashcardMap'
      ),
      {
        maxAttempts: 3,
        baseDelayMs: 1000,
        onRetry: (attempt, error) => {
          logWarn({
            agent: 'FlashcardGraph',
            phase: 'map_process',
            chunkIndex,
            attempt,
            error: error.message,
          }, `Retry attempt ${attempt}/3`);
        }
      },
      'FlashcardMap'
    );

    // Structured output returns Flashcard[] directly - no parsing needed
    const flashcards = (response as FlashcardResponse).flashcards;

    // Clean flashcard text to remove formatting artifacts
    const cleanedFlashcards = flashcards.map((card: Flashcard) => ({
      front: cleanFrontText(card.front),
      back: cleanBackText(card.back),
      topic: card.topic,
    }));

    const flashcardCount = cleanedFlashcards.length;
    const elapsed = Date.now() - startTime;

    // Structured logging complete
    logPhaseComplete({
      agent: 'FlashcardGraph',
      phase: 'map_process',
      chunkIndex,
      questionsGenerated: flashcardCount,
      processingTimeMs: elapsed,
    });

    // Return single output in array - reducer will concatenate all outputs
    // NOTE: Do NOT update progress here - parallel executions cause race conditions.
    // Progress is calculated in collapse node based on mapOutputs.length
    return {
      mapOutputs: [cleanedFlashcards],
    };
  } catch (error) {
    // ============================================================
    // DEBUG: Unmask the actual exception
    // ============================================================
    console.error('\n' + '='.repeat(80));
    console.error('[FlashcardGraph] RAW ERROR DETAILS - Map Process Failed');
    console.error('='.repeat(80));
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'map_process',
      chunkIndex,
      chunkLength: chunk.length,
      errorType: typeof error,
      errorName: error instanceof Error ? error.name : 'N/A',
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack?.split('\n').slice(0, 5).join('\n') : 'N/A',
      fullError: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : String(error),
    }, null, 2));
    console.error('='.repeat(80) + '\n');

    // Error handling: return empty array on permanent failure
    const errorContext = {
      agent: 'FlashcardGraph',
      phase: 'map_process',
      chunkIndex,
      chunkLength: chunk.length,
      difficulty,
    };

    // Pass the actual error object to logError, not a generic string
    const errorToLog = error instanceof Error ? error : new Error(String(error));
    logError(errorContext, errorToLog);

    const elapsed = Date.now() - startTime;
    logPhaseComplete({
      agent: 'FlashcardGraph',
      phase: 'map_process',
      chunkIndex,
      questionsGenerated: 0,
      processingTimeMs: elapsed,
    });

    return {
      mapOutputs: [[]],
    };
  }
}

/**
 * Node: Collapse phase (if needed)
 */
async function collapse(
  state: OverallStateType,
  estimateTokens: (text: string) => number,
  recursiveCollapse: (outputs: Flashcard[][]) => Promise<Flashcard[][]>
): Promise<Partial<OverallStateType>> {
  // ============================================================
  // DEBUG: Collapse Phase Analysis
  // ============================================================
  console.log(`\n${'='.repeat(80)}`);
  console.log('[FlashcardGraph] ===== COLLAPSE PHASE =====');
  console.log('='.repeat(80));

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    phase: 'collapse',
    mapOutputsReceived: state.mapOutputs.length,
    mapOutputsDetails: state.mapOutputs.map((output, idx) => {
      const cardCount = output.length;
      const preview = output.length > 0 
        ? `${output[0].front.substring(0, 50)}...` 
        : 'empty';
      return {
        index: idx,
        cards: cardCount,
        preview,
      };
    }),
  }, null, 2));

  // Safety check: if no mapOutputs, return early
  if (!state.mapOutputs || state.mapOutputs.length === 0) {
    console.error('[FlashcardGraph] Collapse: ERROR - No mapOutputs received!');
    await callStatusUpdate(state, 'collapsing');
    return {
      ...state,
      collapsedOutputs: [],
      status: 'reducing',
      progress: {
        phase: 'collapse',
        percentage: 60,
        message: 'No chunks to process',
        chunksCompleted: 0,
        totalChunks: state.progress?.totalChunks || 0,
      },
    };
  }

  // Calculate progress based on completed chunks (fixes race condition from parallel map_process)
  // All map processes have completed by the time we reach collapse
  const chunksCompleted = state.mapOutputs.length;
  const totalChunks = state.progress?.totalChunks || state.chunks.length || chunksCompleted;
  // Progress: 10% (split) + 50% (map phase, based on completion) + 20% (collapse/reduce phases)
  const mapPhaseProgress = Math.min((chunksCompleted / Math.max(totalChunks, 1)) * 50, 50);
  const percentage = Math.min(10 + mapPhaseProgress + 10, 70); // 10% split + map progress + 10% for collapse start

  // Call status update callback
  await callStatusUpdate(state, 'collapsing');

  // Helper to format flashcards as text (matches collapseGroup prompt format)
  const formatFlashcardsAsText = (flashcards: Flashcard[]): string => {
    return flashcards
      .map((card, index) => `${index + 1}. Q: ${card.front}\n   A: ${card.back}`)
      .join('\n\n');
  };

  // Calculate tokens by formatting as text (matches actual prompt format)
  const totalTokens = state.mapOutputs.reduce(
    (sum, flashcards) => sum + estimateTokens(formatFlashcardsAsText(flashcards)),
    0
  );

  console.log(`[FlashcardGraph] Total tokens: ${totalTokens}, Reduce chunk size: ${FLASHCARD_CONFIG.REDUCE_CHUNK_SIZE_TOKENS} tokens`);

  // Use REDUCE_CHUNK_SIZE_TOKENS for collapse phase (smart_llm has larger context)
  if (totalTokens <= FLASHCARD_CONFIG.REDUCE_CHUNK_SIZE_TOKENS) {
    console.log('[FlashcardGraph] Collapse: skipping recursive collapse, using mapOutputs directly');

    // Calculate memory freed before clearing (estimate based on flashcard count)
    const totalCards = state.mapOutputs.reduce((sum, group) => sum + group.length, 0);
    const estimatedSize = totalCards * 200; // Rough estimate: ~200 bytes per flashcard
    console.log(`[FlashcardGraph] Collapse: freeing ~${(estimatedSize / 1024).toFixed(2)} KB from mapOutputs`);

    return {
      ...state,
      collapsedOutputs: state.mapOutputs,
      status: 'reducing',
      // Clear mapOutputs to free memory - no longer needed after collapse
      ...clearStateKeys<OverallStateType>(['mapOutputs']),
      progress: {
        phase: 'collapse',
        percentage,
        message: `Collected ${chunksCompleted} chunk outputs`,
        chunksCompleted,
        totalChunks,
      },
    };
  }

  // Recursive collapse
  console.log('[FlashcardGraph] Collapse: performing recursive collapse');
  const collapsed = await recursiveCollapse(state.mapOutputs);

  // Calculate memory freed before clearing (estimate based on flashcard count)
  const totalCards = state.mapOutputs.reduce((sum, group) => sum + group.length, 0);
  const estimatedSize = totalCards * 200; // Rough estimate: ~200 bytes per flashcard
  console.log(`[FlashcardGraph] Collapse: freeing ~${(estimatedSize / 1024).toFixed(2)} KB from mapOutputs`);

  return {
    ...state,
    collapsedOutputs: collapsed,
    status: 'reducing',
    // Clear mapOutputs to free memory - no longer needed after collapse
    ...clearStateKeys<OverallStateType>(['mapOutputs']),
    progress: {
      phase: 'collapse',
      percentage,
      message: `Collapsed ${chunksCompleted} outputs into ${collapsed.length}`,
      chunksCompleted,
      totalChunks,
    },
  };
}

// ============================================================
// FLASHCARD GRAPH CLASS
// ============================================================

/**
 * FlashcardGraph class that orchestrates flashcard generation.
 * This is the main class that users interact with.
 */
export class FlashcardGraph {
  private fastLlm: ChatTogetherAI;
  private smartLlm: ChatTogetherAI;
  private fastLlmStructured: FlashcardOutputInvoker;

  constructor(apiKey: string, mapModel: string, reduceModel: string) {
    // Fast model for map phase (parallel flashcard generation with structured output)
    // No maxTokens needed - output is short and controlled by prompt
    this.fastLlm = new ChatTogetherAI({
      apiKey,
      model: mapModel,
      temperature: 0.3, // Lower temperature for factual extraction
    });

    // Smart model for reduce/collapse phases (selection and refinement)
    // maxTokens needed for large flashcard sets (55+ cards) to prevent truncation
    this.smartLlm = new ChatTogetherAI({
      apiKey,
      model: reduceModel,
      temperature: 0.3, // Lower temperature for consistent selection
      maxTokens: FLASHCARD_CONFIG.REDUCE_MAX_TOKENS, // Enough for large flashcard sets in JSON format
    });

    // Fast model with structured output for reliable JSON flashcard generation
    this.fastLlmStructured = createStructuredLLM(this.fastLlm, FlashcardArraySchema);
  }

  private estimateTokens(text: string): number {
    // Use accurate token counting via tiktoken
    return countTokens(text);
  }

  /**
   * Format flashcards as text for LLM input.
   * This matches the format used in collapseGroup prompts, ensuring accurate token estimation.
   */
  private formatFlashcardsAsText(flashcards: Flashcard[]): string {
    return flashcards
      .map((card, index) => `${index + 1}. Q: ${card.front}\n   A: ${card.back}`)
      .join('\n\n');
  }

  // Generate a short hash for identifying chunks in logs
  private chunkHash(chunk: string): string {
    // First 50 chars + length + last 20 chars for identification
    const start = chunk.substring(0, 50).replace(/\n/g, ' ');
    const end = chunk.substring(Math.max(0, chunk.length - 20)).replace(/\n/g, ' ');
    return `[${chunk.length} chars] "${start}..."..."${end}"`;
  }

  private async recursiveCollapse(outputs: Flashcard[][]): Promise<Flashcard[][]> {
    // Calculate tokens by formatting as text (matches actual prompt format)
    const totalTokens = outputs.reduce(
      (sum, flashcards) => sum + this.estimateTokens(this.formatFlashcardsAsText(flashcards)),
      0
    );

    // Use REDUCE_CHUNK_SIZE_TOKENS for collapse phase (smart_llm has larger context)
    if (totalTokens <= FLASHCARD_CONFIG.REDUCE_CHUNK_SIZE_TOKENS) {
      return outputs;
    }

    // Dynamic grouping based on token budget
    const targetGroupTokens = FLASHCARD_CONFIG.REDUCE_CHUNK_SIZE_TOKENS * 0.8; // Leave 20% buffer
    const collapsed: Flashcard[][] = [];
    let currentGroup: Flashcard[][] = [];
    let currentTokens = 0;

    for (const flashcards of outputs) {
      const tokens = this.estimateTokens(this.formatFlashcardsAsText(flashcards));
      if (currentTokens + tokens > targetGroupTokens && currentGroup.length > 0) {
        collapsed.push(await this.collapseGroup(currentGroup));
        currentGroup = [flashcards];
        currentTokens = tokens;
      } else {
        currentGroup.push(flashcards);
        currentTokens += tokens;
      }
    }

    if (currentGroup.length > 0) {
      collapsed.push(await this.collapseGroup(currentGroup));
    }

    // Recursively check if still too large
    return this.recursiveCollapse(collapsed);
  }

  /**
   * Collapse a group of flashcard arrays by merging and condensing.
   * Uses structured output to ensure valid JSON output.
   */
  private async collapseGroup(group: Flashcard[][]): Promise<Flashcard[]> {
    // Flatten all flashcard arrays into a single array
    const allCards: Flashcard[] = [];
    for (const flashcards of group) {
      allCards.push(...flashcards);
    }

    logInfo({
      agent: 'FlashcardGraph',
      phase: 'collapse_group',
      inputCount: group.length,
      mergedCardCount: allCards.length,
    }, `Collapsing ${group.length} outputs (${allCards.length} cards)`);

    // If we have few cards, just return the merged array as-is
    // For large sets, we might want to deduplicate/condense
    if (allCards.length <= 30) {
      // No need for LLM condensation for small sets
      return allCards;
    }

    // For larger sets, use LLM to condense and deduplicate
    // Format flashcards for the prompt
    const flashcardsText = allCards
      .map((card, index) => `${index + 1}. Q: ${card.front}\n   A: ${card.back}`)
      .join('\n\n');

    const prompt = `You are consolidating flashcard sets. Your task is to:
1. Remove duplicate or highly similar flashcards
2. Keep the highest quality, most diverse set
3. Target approximately ${Math.floor(allCards.length * 0.7)} flashcards (remove ~30%)

Condense these flashcards while maintaining quality and diversity:

${flashcardsText}

Return the condensed flashcards as a JSON array with "front" and "back" fields.`;

    // Use structured output for reliable JSON
    // @ts-ignore - Type instantiation is excessively deep with LangChain's withStructuredOutput
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const structuredLlm = this.smartLlm.withStructuredOutput(FlashcardArraySchema, {
      name: "flashcard_array"
    }) as any;

    const response = await invokeWithRetry(
      () => invokeWithTimeout(
        () => (structuredLlm as any).invoke([
          new SystemMessage(COLLAPSE_SYSTEM_PROMPT),
          new HumanMessage(prompt),
        ], createLangSmithRunConfig({
          runName: 'FlashcardGraph.CollapseGroup',
          tags: ['agent', 'flashcard', 'collapse'],
          metadata: {
            inputCount: group.length,
            mergedCardCount: allCards.length,
          },
        })),
        FLASHCARD_CONFIG.REDUCE_TIMEOUT_MS,
        'FlashcardCollapseGroup'
      ),
      {
        maxAttempts: 2,
        baseDelayMs: 1000,
      },
      'FlashcardCollapseGroup'
    ) as FlashcardResponse;

    // Return flashcards directly - cleaning was done in Map phase
    return response.flashcards;
  }

  /**
   * Refine flashcard selection when we have too many cards
   * Uses LLM to intelligently select the best cards while preserving topic coverage
   */
  private async refineFlashcardSelection(
    flashcards: Flashcard[],
    targetCount: number,
    difficulty: string,
    topic?: string
  ): Promise<Flashcard[]> {
    logInfo({
      agent: 'FlashcardGraph',
      phase: 'refine_selection',
      totalFlashcards: flashcards.length,
      targetCount,
    }, `Selecting ${targetCount} best cards from ${flashcards.length}`);

    // Detect similar flashcards for logging visibility
    const similarFlashcards = await this.detectSimilarFlashcards(flashcards);

    if (similarFlashcards.length > 0) {
      logInfo({
        agent: 'FlashcardGraph',
        phase: 'refine_similarity_detection',
        duplicateGroups: similarFlashcards.length,
        duplicates: similarFlashcards.slice(0, 5).map(d => ({
          type: d.similarity,
          reason: d.reason,
          flashcards: d.flashcards.map(f => ({ front: f.front.substring(0, 60), back: f.back.substring(0, 60) })),
        })),
      }, `Detected ${similarFlashcards.length} potential duplicate groups - LLM will handle merging`);
    }

    // Format flashcards for the prompt
    const flashcardsText = flashcards
      .map((card, index) => `${index + 1}. Q: ${card.front}\n   A: ${card.back}`)
      .join('\n\n');

    const prompt = `You are an expert educator selecting and refining flashcards for a study set.

CRITICAL REQUIREMENTS:
- Select approximately ${targetCount} flashcards (flexible: ±${Math.ceil(targetCount * 0.2)} is acceptable)
- IDENTIFY AND MERGE similar or duplicate flashcards before selecting
- Quality over quantity: Better to have ${Math.ceil(targetCount * 0.8)} unique cards than ${targetCount} with duplicates
- Your goal is MAXIMUM SEMANTIC DIVERSITY - each card should cover a distinct concept

SIMILARITY DETECTION GUIDELINES:
Flashcards are considered similar if they:
- Test the same definition or concept (e.g., "Define X" on front, "What is X" on front)
- Have the same answer despite different question phrasing
- Cover overlapping content that could be combined into one card

MERGING STRATEGY:
When you find similar flashcards:
- Combine the best elements from each version (clearest question, most complete answer)
- Create a single, clearer flashcard
- Ensure the merged card is self-contained
- Keep the most comprehensive explanation or examples

TOPIC DIVERSITY:
Additionally, select flashcards from DIFFERENT topics. Do NOT select more than 3 cards from any single topic.
If there are 6+ topics available, select 1-3 cards from each topic.
Example: If you need 20 cards and have 5 topics, select 4 from each topic

From the ${flashcards.length} flashcards below, select approximately ${targetCount}.
${topic ? `User preference: ${topic} (but still maintain diversity)` : ''}

Available flashcards:
${flashcardsText}

Return the complete selected flashcards as a JSON array. For each flashcard, include a "topic" field that categorizes the card (e.g., "Definitions", "Processes", "Timeline", "Concepts", etc.). This helps ensure topic diversity.`;

    // Use structured output for reliable parsing
    // @ts-ignore - Type instantiation is excessively deep with LangChain's withStructuredOutput
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const structuredLlm = this.smartLlm.withStructuredOutput(FlashcardArraySchema, {
      name: "flashcard_array"
    }) as any;

    // Use timeout and retry for refinement LLM call
    const response = await invokeWithRetry(
      () => invokeWithTimeout(
        () => (structuredLlm as any).invoke([
          new SystemMessage(REDUCE_SYSTEM_PROMPT),
          new HumanMessage(prompt),
        ], createLangSmithRunConfig({
          runName: 'FlashcardGraph.RefineSelection',
          tags: ['agent', 'flashcard', 'reduce'],
          metadata: {
            targetCount,
            difficulty,
            topic: topic || 'none',
            candidateCount: flashcards.length,
          },
        })),
        FLASHCARD_CONFIG.REDUCE_TIMEOUT_MS,
        'FlashcardRefineSelection'
      ),
      {
        maxAttempts: 2,
        baseDelayMs: 1000,
      },
      'FlashcardRefineSelection'
    );

    // Type assertion is safe now with proper schema configuration
    const selected = (response as FlashcardResponse).flashcards;

    logInfo({
      agent: 'FlashcardGraph',
      phase: 'refine_selection_complete',
      selectedCount: selected.length,
    });

    // Log topic distribution for debugging
    const topicGroups = this.groupFlashcardsByTopic(selected);
    logInfo({
      agent: 'FlashcardGraph',
      phase: 'refine_topic_distribution',
      topicDistribution: topicGroups,
    });

    // If LLM returned no flashcards, this is an error condition
    if (selected.length === 0) {
      logError({
        agent: 'FlashcardGraph',
        phase: 'refine_selection',
        issue: 'llm_returned_empty',
        inputCount: flashcards.length,
        targetCount,
      }, 'LLM returned empty selection - this should not happen with structured output');
      return [];
    }

    // Simple count adjustment (trust LLM's topic/diversity logic)
    if (selected.length > targetCount) {
      logInfo({
        agent: 'FlashcardGraph',
        phase: 'refine_selection_truncate',
        selectedCount: selected.length,
        targetCount,
      }, `Truncating to ${targetCount} (LLM returned more than requested)`);
      return selected.slice(0, targetCount);
    }

    if (selected.length < targetCount) {
      const remaining = flashcards.filter(f =>
        !selected.some(s => s.front === f.front && s.back === f.back)
      );
      const needed = targetCount - selected.length;

      if (remaining.length > 0) {
        logInfo({
          agent: 'FlashcardGraph',
          phase: 'refine_selection_fill',
          selectedCount: selected.length,
          targetCount,
        }, `Filling ${needed} more from remaining ${remaining.length}`);
        return [...selected, ...remaining.slice(0, needed)];
      }
    }

    return selected;
  }


  // Extract topic from a flashcard for topic distribution logging
  // Trusts LLM-provided topic entirely for flexibility and consistency
  private extractTopic(card: Flashcard): string {
    // Use LLM-provided topic if available - trust it entirely
    if (card.topic && card.topic.trim().length > 0) {
      return card.topic.trim();
    }

    // If no LLM topic provided (should be rare with structured output), use generic category
    // This avoids mismatches between LLM topics and hardcoded keyword categories
    return 'Uncategorized';
  }

  // Helper method to group flashcards by topic for debugging
  private groupFlashcardsByTopic(flashcards: Flashcard[]): Record<string, number> {
    const topics: Record<string, number> = {};

    for (const card of flashcards) {
      // Use the same generalized topic extraction logic as extractTopic()
      const topic = this.extractTopic(card);
      topics[topic] = (topics[topic] || 0) + 1;
    }

    return topics;
  }

  /**
   * Validate that a flashcard is self-contained (doesn't reference external content)
   * Returns true if the flashcard is self-contained, false if it has problematic phrases.
   *
   * Smart validation: Only reject flashcards that are BOTH short (<150 chars) AND have problematic phrases.
   * Longer flashcards likely include the necessary context embedded.
   */
  private validateSelfContained(card: Flashcard): boolean {
    const text = card.front.toLowerCase();
    const hasProblematicPhrase = PROBLEMATIC_PHRASES.some(phrase => text.includes(phrase));
    const isShort = text.length < 150;

    // Only reject if both short AND has problematic phrases
    // (longer flashcards likely have context embedded despite the phrases)
    const shouldReject = hasProblematicPhrase && isShort;

    if (shouldReject) {
      logWarn({
        agent: 'FlashcardGraph',
        phase: 'validate_self_contained',
        questionPreview: card.front.substring(0, 100),
        questionLength: text.length,
        foundPhrases: PROBLEMATIC_PHRASES.filter(phrase => text.includes(phrase)),
      }, 'Flashcard rejected: short with potential external references');
    } else if (hasProblematicPhrase && !isShort) {
      logInfo({
        agent: 'FlashcardGraph',
        phase: 'validate_self_contained_accept',
        questionPreview: card.front.substring(0, 100),
        questionLength: text.length,
        foundPhrases: PROBLEMATIC_PHRASES.filter(phrase => text.includes(phrase)),
      }, 'Flashcard accepted: has phrases but is long enough to include context');
    }

    return !shouldReject;
  }

  /**
   * Calculate Levenshtein distance for character-level similarity.
   * Used to detect rewordings and slight variations.
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    return dp[m][n];
  }

  /**
   * Detect semantically similar flashcards using multi-dimensional heuristics.
   * Enhanced to catch more duplicates with improved accuracy.
   * 
   * Performance optimization: For large sets (>100), yields control periodically
   * to prevent event loop blocking. For very large sets (>200), limits comparison
   * window to last 20 cards to reduce O(n²) complexity.
   */
  private async detectSimilarFlashcards(flashcards: Flashcard[]): Promise<Array<{
    similarity: string;
    flashcards: Array<{index: number; front: string; back: string}>;
    reason: string;
  }>> {
    const duplicates: Array<{
      similarity: string;
      flashcards: Array<{index: number; front: string; back: string}>;
      reason: string;
    }> = [];

    // Performance optimization: Limit comparison window for very large sets
    const COMPARISON_WINDOW = 20; // Only compare against last N cards for large sets
    const YIELD_INTERVAL = 50; // Yield control every N comparisons for large sets
    const LARGE_SET_THRESHOLD = 100; // Start yielding at this size
    const useWindowedComparison = flashcards.length > 200;

    // Helper to normalize text for comparison
    const normalizeText = (text: string): string => {
      return text
        .toLowerCase()
        .replace(/\\"/g, '"') // Remove escaped quotes
        .replace(/\s+/g, ' ') // Normalize whitespace
        .replace(/[^\w\s]/g, '') // Remove punctuation
        .trim();
    };

    // Helper to extract words
    const extractWords = (text: string): Set<string> => {
      const normalized = normalizeText(text);
      const words = normalized.match(/\b\w+\b/g) || [];
      return new Set(words);
    };

    let comparisonCount = 0;

    for (let i = 0; i < flashcards.length; i++) {
      // Determine comparison range: use windowed comparison for very large sets
      const startJ = useWindowedComparison 
        ? Math.max(i + 1, flashcards.length - COMPARISON_WINDOW)
        : i + 1;

      for (let j = startJ; j < flashcards.length; j++) {
        comparisonCount++;

        // Yield control periodically for large sets to prevent event loop blocking
        if (flashcards.length > LARGE_SET_THRESHOLD && comparisonCount % YIELD_INTERVAL === 0) {
          await new Promise(resolve => setImmediate(resolve));
        }

        const f1 = flashcards[i];
        const f2 = flashcards[j];

        // Check 1: Front text word overlap (>70%)
        const words1 = extractWords(f1.front);
        const words2 = extractWords(f2.front);
        const intersection = [...words1].filter(w => words2.has(w));
        const union = new Set([...words1, ...words2]);
        const frontOverlap = intersection.length / union.size;

        if (frontOverlap > 0.7) {
          duplicates.push({
            similarity: 'high_front_overlap',
            flashcards: [
              { index: i, front: f1.front, back: f1.back },
              { index: j, front: f2.front, back: f2.back },
            ],
            reason: `Front word overlap: ${(frontOverlap * 100).toFixed(0)}%`,
          });
          continue; // Already detected, skip other checks
        }

        // Check 2: Back text word overlap (>75% - stricter for answers)
        const backWords1 = extractWords(f1.back);
        const backWords2 = extractWords(f2.back);
        const backIntersection = [...backWords1].filter(w => backWords2.has(w));
        const backUnion = new Set([...backWords1, ...backWords2]);
        const backOverlap = backIntersection.length / backUnion.size;

        if (backOverlap > 0.75) {
          duplicates.push({
            similarity: 'high_back_overlap',
            flashcards: [
              { index: i, front: f1.front, back: f1.back },
              { index: j, front: f2.front, back: f2.back },
            ],
            reason: `Back word overlap: ${(backOverlap * 100).toFixed(0)}%`,
          });
          continue;
        }

        // Check 3: Same definition pattern (e.g., "Define X" vs "What is X")
        const normalizedFront1 = normalizeText(f1.front);
        const normalizedFront2 = normalizeText(f2.front);

        const isDefinition1 = /^(what is|define|explain|describe)/.test(normalizedFront1);
        const isDefinition2 = /^(what is|define|explain|describe)/.test(normalizedFront2);

        if (isDefinition1 && isDefinition2) {
          // Extract the last word or phrase as the potential term being defined
          const words1Arr = normalizedFront1.split(/\s+/);
          const words2Arr = normalizedFront2.split(/\s+/);
          const term1 = words1Arr[words1Arr.length - 1] || '';
          const term2 = words2Arr[words2Arr.length - 1] || '';

          if (term1 === term2 && term1.length > 2) {
            duplicates.push({
              similarity: 'same_definition_pattern',
              flashcards: [
                { index: i, front: f1.front, back: f1.back },
                { index: j, front: f2.front, back: f2.back },
              ],
              reason: `Both define same term: "${term1}"`,
            });
            continue;
          }
        }

        // Check 4: Character sequence similarity (catches slight rewordings)
        // Skip expensive Levenshtein for very large sets in windowed mode
        if (!useWindowedComparison) {
          const charSimilarity = (s1: string, s2: string): number => {
            const longer = s1.length > s2.length ? s1 : s2;
            const shorter = s1.length > s2.length ? s2 : s1;
            if (longer.length === 0) return 1.0;
            return (longer.length - this.levenshteinDistance(longer, shorter)) / longer.length;
          };

          const frontCharSim = charSimilarity(normalizedFront1, normalizedFront2);
          if (frontCharSim > 0.85) {
            duplicates.push({
              similarity: 'high_character_similarity',
              flashcards: [
                { index: i, front: f1.front, back: f1.back },
                { index: j, front: f2.front, back: f2.back },
              ],
              reason: `Character similarity: ${(frontCharSim * 100).toFixed(0)}%`,
            });
          }
        }
      }
    }

    return duplicates;
  }

  /**
   * Node: Reduce phase
   */
  async reduce(state: OverallStateType): Promise<Partial<OverallStateType>> {
    // Call status update callback
    await callStatusUpdate(state, 'reducing');

    // Structured logging start
    logPhaseStart({
      agent: 'FlashcardGraph',
      phase: 'reduce',
      collapsedOutputsCount: state.collapsedOutputs.length,
      targetCardCount: state.cardCount,
      difficulty: state.difficulty,
      topic: state.topic || 'none',
    });

    // Log each collapsed output for analysis
    state.collapsedOutputs.forEach((flashcards, idx) => {
      const cardCount = flashcards.length;
      const preview = flashcards.length > 0 
        ? `${flashcards[0].front.substring(0, 50)}...` 
        : 'empty';

      logInfo({
        agent: 'FlashcardGraph',
        phase: 'reduce_analyze_output',
        outputIndex: idx,
        outputCount: state.collapsedOutputs.length,
        cardCount,
        preview,
      });
    });

    // Step 1: Flatten collapsed outputs into a single array
    const parsedFlashcards = this.flattenCollapsedOutputs(state.collapsedOutputs);

    logInfo({
      agent: 'FlashcardGraph',
      phase: 'reduce_after_flatten',
      initialCardCount: parsedFlashcards.length,
    }, `Flattened ${parsedFlashcards.length} flashcards - running LLM refinement...`);

    // Step 2: ALWAYS run LLM refinement for quality control
    let finalFlashcards: Flashcard[];

    // If still no flashcards, this is a critical failure
    if (parsedFlashcards.length === 0) {
      const totalInputs = state.collapsedOutputs.reduce((sum, flashcards) => {
        return sum + flashcards.length;
      }, 0);

      logError({
        agent: 'FlashcardGraph',
        phase: 'reduce',
        error: 'No flashcards parsed',
        totalInputs,
      }, `CRITICAL: No flashcards parsed despite ${totalInputs} input cards!`);
      await callStatusUpdate(state, 'failed');
      return {
        ...state,
        finalOutput: [],
        status: 'failed',
      };
    }

    // Step 3: Apply LLM refinement (handles deduplication, merging, semantic diversity)
    finalFlashcards = await this.refineFlashcardSelection(
      parsedFlashcards,
      state.cardCount,
      state.difficulty,
      state.topic
    );

    logInfo({
      agent: 'FlashcardGraph',
      phase: 'reduce_after_refinement',
      refinedCount: finalFlashcards.length,
      originalCount: parsedFlashcards.length,
    }, `LLM refinement complete: ${parsedFlashcards.length} → ${finalFlashcards.length} cards`);

    // Log topic distribution AFTER refinement
    const topicDistribution = this.groupFlashcardsByTopic(finalFlashcards);
    logInfo({
      agent: 'FlashcardGraph',
      phase: 'reduce_topic_distribution',
      topicDistribution,
    }, `Final topic distribution across ${finalFlashcards.length} cards`);

    // Log all generated flashcards for analysis
    logInfo({
      agent: 'FlashcardGraph',
      phase: 'reduce_flashcards_detail',
      flashcards: finalFlashcards.map((card, idx) => ({
        index: idx + 1,
        front: card.front,
        backLength: card.back.length,
        backPreview: card.back.substring(0, 100),
      })),
    });

    // Validate flashcard quality
    const validation = validateFlashcards(JSON.stringify(finalFlashcards), state.cardCount);
    logInfo({
      agent: 'FlashcardGraph',
      phase: 'reduce_validation',
      validation: {
        isValid: validation.isValid,
        warnings: validation.warnings,
        score: validation.score,
      },
    });

    logInfo({
      agent: 'FlashcardGraph',
      phase: 'reduce',
      flashcardsGenerated: finalFlashcards.length,
      targetCardCount: state.cardCount,
    }, `Generated ${finalFlashcards.length} flashcards (target: ${state.cardCount})`);

    // Log if count doesn't match target (LLM should handle exact count in reduce phase)
    if (finalFlashcards.length !== state.cardCount) {
      logWarn({
        agent: 'FlashcardGraph',
        phase: 'reduce_count_mismatch',
        generatedCount: finalFlashcards.length,
        targetCount: state.cardCount,
      }, `LLM returned ${finalFlashcards.length} cards, target was ${state.cardCount}. Accepting LLM result.`);
    }

    // Log final cards
    logInfo({
      agent: 'FlashcardGraph',
      phase: 'reduce_final',
      finalFlashcardCount: finalFlashcards.length,
      finalFlashcards: finalFlashcards.map((card, idx) => ({
        index: idx + 1,
        front: card.front,
        backLength: card.back.length,
        backPreview: card.back.substring(0, 100),
      })),
    });

    logBanner(
      {
        agent: 'FlashcardGraph',
        phase: 'generation_complete',
        finalFlashcardCount: finalFlashcards.length,
        targetCardCount: state.cardCount,
      },
      'GENERATION COMPLETE'
    );

    // Calculate memory to be freed (estimate based on flashcard count)
    const totalCards = state.collapsedOutputs.reduce((sum, group) => sum + group.length, 0);
    const estimatedSize = totalCards * 200; // Rough estimate: ~200 bytes per flashcard
    const chunksSize = (state.chunks || []).reduce((sum, s) => sum + s.length * 2, 0);
    console.log(`[FlashcardGraph] Reduce: freeing ~${((estimatedSize + chunksSize) / 1024).toFixed(2)} KB from intermediate data`);

    return {
      ...state,
      finalOutput: finalFlashcards,
      status: 'completed',
      // Clear collapsedOutputs and chunks to free memory - no longer needed after reduce
      ...clearStateKeys<OverallStateType>(['collapsedOutputs', 'chunks']),
      progress: {
        phase: 'reduce',
        percentage: 100,
        message: `Completed: ${finalFlashcards.length} flashcards generated`,
        itemsGenerated: finalFlashcards.length,
      },
    };
  }

  /**
   * Flatten collapsed outputs (Flashcard[][]) into a single Flashcard[] array.
   * Validates and cleans each flashcard.
   */
  private flattenCollapsedOutputs(outputs: Flashcard[][]): Flashcard[] {
    const allCards: Flashcard[] = [];
    let failedValidationCount = 0;

    for (const flashcards of outputs) {
      for (const card of flashcards) {
        // Validate each card before adding (no cleaning needed - done in Map phase)
        if (card.front && card.back && this.validateSelfContained(card)) {
          allCards.push(card);
        } else {
          failedValidationCount++;
        }
      }
    }

    logInfo({
      agent: 'FlashcardGraph',
      phase: 'flatten_collapsed_outputs_complete',
      extractedCount: allCards.length,
      failedValidationCount,
    }, `Flattened ${allCards.length} flashcards (${failedValidationCount} failed validation)`);

    return allCards;
  }

  /**
   * Route to map phase - creates Send objects for parallel processing.
   */
  routeToMap(state: OverallStateType): Send[] | 'collapse' {
    return routeToMap(state);
  }

  /**
   * Build the state graph for flashcard generation.
   */
  buildGraph() {
    const builder = new StateGraph(OverallState);

    // Bind node functions to this instance
    builder.addNode('split_chunks', (s: OverallStateType) => splitChunks(s));
    builder.addNode('map_process', (s: ChunkProcessState) => mapProcess(s, this.fastLlmStructured));
    builder.addNode('collapse', (s: OverallStateType) => collapse(s, this.estimateTokens.bind(this), this.recursiveCollapse.bind(this)));
    builder.addNode('reduce', (s: OverallStateType) => this.reduce(s));

    builder.addEdge(START, 'split_chunks' as any);

    // Conditional edge for Send API fan-out
    builder.addConditionalEdges(
      'split_chunks' as any,
      (s: OverallStateType) => this.routeToMap(s),
      { map_process: 'map_process', collapse: 'collapse' } as any
    );

    builder.addEdge('map_process' as any, 'collapse' as any);
    builder.addEdge('collapse' as any, 'reduce' as any);
    builder.addEdge('reduce' as any, END as any);

    return builder.compile();
  }
}
