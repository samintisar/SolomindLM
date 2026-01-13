/**
 * Node functions and main class for FlashcardGraph.
 *
 * Contains all node logic for split_chunks, map_process, collapse,
 * and reduce phases, along with the main FlashcardGraph class.
 */

import { StateGraph, START, END, Send } from '@langchain/langgraph';
import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { env } from '../../../config/env.js';

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
} from '../shared/index.js';

// Import from local modules
import { OverallState, type OverallStateType, type ChunkProcessState, type Flashcard } from './state.js';
import { getMapPrompt, getReducePrompt, PROBLEMATIC_PHRASES, FlashcardArraySchema, type FlashcardResponse } from './prompts.js';

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
 * Node: Split chunks for routing
 */
function splitChunks(state: OverallStateType): Partial<OverallStateType> {
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
 */
async function mapProcess(
  state: ChunkProcessState,
  fastLlm: ChatTogetherAI
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
        () => fastLlm.invoke([
          new SystemMessage('You are a professional educator and content analyst.'),
          new HumanMessage(prompt),
        ]),
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

    output = response.content.toString();
  } catch (error) {
    // Graceful fallback on permanent failure
    const errorContext = {
      agent: 'FlashcardGraph',
      phase: 'map_process',
      chunkIndex,
      chunkLength: chunk.length,
      difficulty,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 3).join('\n'),
      } : String(error),
    };

    logError(errorContext, 'Map process failed');

    output = `- Main Topics: Error processing chunk
- Error: ${error instanceof Error ? error.message : 'Unknown error'}
- Chunk Info: ${chunk.length} chars, difficulty: ${difficulty}

[Fallback: This chunk could not be processed due to timeout or error. The flashcard generation will continue with other chunks.]`;
  }

  const questionCount = output.split('Q:').length - 1;
  const elapsed = Date.now() - startTime;

  // Structured logging complete
  logPhaseComplete({
    agent: 'FlashcardGraph',
    phase: 'map_process',
    chunkIndex,
    outputLength: output.length,
    questionsGenerated: questionCount,
    processingTimeMs: elapsed,
    outputPreview: output.substring(0, 200).replace(/\n/g, ' '),
  });

  // Return single output in array - reducer will concatenate all outputs
  return {
    mapOutputs: [output],
    progress: {
      phase: 'map_process',
      percentage: Math.min(10 + ((chunkIndex ?? 0) * 30), 60),
      message: `Chunk ${(chunkIndex ?? 0) + 1} complete: ${questionCount} cards`,
      chunksCompleted: (chunkIndex ?? 0) + 1,
    },
  };
}

/**
 * Node: Collapse phase (if needed)
 */
async function collapse(
  state: OverallStateType,
  estimateTokens: (text: string) => number,
  recursiveCollapse: (outputs: string[]) => Promise<string[]>
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
    mapOutputsDetails: state.mapOutputs.map((output, idx) => ({
      index: idx,
      length: output.length,
      questions: output.split('Q:').length - 1,
      preview: output.substring(0, 100).replace(/\n/g, ' '),
    })),
  }, null, 2));

  // Safety check: if no mapOutputs, return early
  if (!state.mapOutputs || state.mapOutputs.length === 0) {
    console.error('[FlashcardGraph] Collapse: ERROR - No mapOutputs received!');
    return {
      ...state,
      collapsedOutputs: [],
      status: 'reducing',
    };
  }

  const totalTokens = state.mapOutputs.reduce(
    (sum, s) => sum + estimateTokens(s),
    0
  );

  console.log(`[FlashcardGraph] Total tokens: ${totalTokens}, Reduce chunk size: ${FLASHCARD_CONFIG.REDUCE_CHUNK_SIZE_TOKENS} tokens`);

  // Use REDUCE_CHUNK_SIZE_TOKENS for collapse phase (smart_llm has larger context)
  if (totalTokens <= FLASHCARD_CONFIG.REDUCE_CHUNK_SIZE_TOKENS) {
    console.log('[FlashcardGraph] Collapse: skipping recursive collapse, using mapOutputs directly');
    return {
      ...state,
      collapsedOutputs: state.mapOutputs,
      status: 'reducing',
      progress: {
        phase: 'collapse',
        percentage: 70,
        message: `Collected ${state.mapOutputs.length} chunk outputs`,
      },
    };
  }

  // Recursive collapse
  console.log('[FlashcardGraph] Collapse: performing recursive collapse');
  const collapsed = await recursiveCollapse(state.mapOutputs);
  return {
    ...state,
    collapsedOutputs: collapsed,
    status: 'reducing',
    progress: {
      phase: 'collapse',
      percentage: 70,
      message: `Collapsed ${state.mapOutputs.length} outputs into ${collapsed.length}`,
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

  constructor(apiKey: string, mapModel: string, reduceModel: string) {
    // Fast model for map phase (parallel Q&A generation)
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
  }

  private estimateTokens(text: string): number {
    // Use accurate token counting via tiktoken
    return countTokens(text);
  }

  // Generate a short hash for identifying chunks in logs
  private chunkHash(chunk: string): string {
    // First 50 chars + length + last 20 chars for identification
    const start = chunk.substring(0, 50).replace(/\n/g, ' ');
    const end = chunk.substring(Math.max(0, chunk.length - 20)).replace(/\n/g, ' ');
    return `[${chunk.length} chars] "${start}..."..."${end}"`;
  }

  private async recursiveCollapse(outputs: string[]): Promise<string[]> {
    const totalTokens = outputs.reduce(
      (sum, s) => sum + this.estimateTokens(s),
      0
    );

    // Use REDUCE_CHUNK_SIZE_TOKENS for collapse phase (smart_llm has larger context)
    if (totalTokens <= FLASHCARD_CONFIG.REDUCE_CHUNK_SIZE_TOKENS) {
      return outputs;
    }

    // Dynamic grouping based on token budget
    const targetGroupTokens = FLASHCARD_CONFIG.REDUCE_CHUNK_SIZE_TOKENS * 0.8; // Leave 20% buffer
    const collapsed: string[] = [];
    let currentGroup: string[] = [];
    let currentTokens = 0;

    for (const output of outputs) {
      const tokens = this.estimateTokens(output);
      if (currentTokens + tokens > targetGroupTokens && currentGroup.length > 0) {
        collapsed.push(await this.collapseGroup(currentGroup));
        currentGroup = [output];
        currentTokens = tokens;
      } else {
        currentGroup.push(output);
        currentTokens += tokens;
      }
    }

    if (currentGroup.length > 0) {
      collapsed.push(await this.collapseGroup(currentGroup));
    }

    // Recursively check if still too large
    return this.recursiveCollapse(collapsed);
  }

  private async collapseGroup(group: string[]): Promise<string> {
    const combined = group.join('\n\n---\n\n');

    const prompt = `Condense these question-answer pairs into a consolidated set while retaining all unique and high-quality pairs:\n\n${combined}\n\nCONDENSED:`;

    // Use timeout and retry for collapse operations
    const response = await invokeWithRetry(
      () => invokeWithTimeout(
        () => this.smartLlm.invoke([
          new SystemMessage('You are a skilled content consolidator.'),
          new HumanMessage(prompt),
        ]),
        FLASHCARD_CONFIG.REDUCE_TIMEOUT_MS,
        'FlashcardCollapseGroup'
      ),
      {
        maxAttempts: 2,
        baseDelayMs: 1000,
      },
      'FlashcardCollapseGroup'
    );

    return response.content.toString();
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
    const similarFlashcards = this.detectSimilarFlashcards(flashcards);

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

Return the complete selected flashcards as a JSON array.`;

    // Use structured output for reliable parsing
    // @ts-ignore - LangGraph structured output has complex types
    const structuredLlm = this.smartLlm.withStructuredOutput(FlashcardArraySchema);

    // Use timeout and retry for refinement LLM call
    const response = await invokeWithRetry(
      () => invokeWithTimeout(
        () => structuredLlm.invoke([
          new SystemMessage('You are an expert curriculum designer creating DIVERSE study sets. Your goal is to spread selections across ALL topics, not cluster on one.'),
          new HumanMessage(prompt),
        ]),
        FLASHCARD_CONFIG.REDUCE_TIMEOUT_MS,
        'FlashcardRefineSelection'
      ),
      {
        maxAttempts: 2,
        baseDelayMs: 1000,
      },
      'FlashcardRefineSelection'
    );

    let selected = (response as FlashcardResponse).flashcards;

    // Clean up any trailing artifacts from structured output (defensive)
    selected = selected.map(card => ({
      front: this.cleanFrontText(card.front),
      back: this.cleanBackText(card.back),
    }));

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

    // Enhanced fallback: handle various edge cases
    if (selected.length === 0) {
      logWarn({
        agent: 'FlashcardGraph',
        phase: 'refine_selection',
        issue: 'parsing_failed',
      }, 'Parsing failed, using heuristic selection with deduplication');

      // Fallback: Apply heuristic deduplication and then select
      return this.heuristicDeduplicateAndSelect(flashcards, targetCount);
    }

    // If still over limit, apply intelligent trimming (respecting semantic diversity)
    if (selected.length > targetCount) {
      logWarn({
        agent: 'FlashcardGraph',
        phase: 'refine_selection',
        selectedCount: selected.length,
        targetCount,
      }, `Got ${selected.length}, applying semantic-aware trimming to ${targetCount}`);
      return this.trimBySemanticDiversity(selected, targetCount);
    }

    // If under limit, fill from remaining (also respecting semantic diversity)
    if (selected.length < targetCount) {
      logWarn({
        agent: 'FlashcardGraph',
        phase: 'refine_selection',
        selectedCount: selected.length,
        targetCount,
      }, `Got ${selected.length}, filling ${targetCount - selected.length} more with semantic awareness`);

      const remaining = flashcards.filter(f =>
        !selected.some(s => s.front === f.front && s.back === f.back)
      );
      const additional = this.trimBySemanticDiversity(remaining, targetCount - selected.length);
      return [...selected, ...additional];
    }

    return selected;
  }

  /**
   * Heuristic deduplication and selection when LLM fails.
   * Uses similarity detection to remove duplicates, then selects by semantic diversity.
   */
  private heuristicDeduplicateAndSelect(
    flashcards: Flashcard[],
    targetCount: number
  ): Flashcard[] {
    logInfo({
      agent: 'FlashcardGraph',
      phase: 'heuristic_deduplication',
      inputCount: flashcards.length,
      targetCount,
    }, 'Applying heuristic deduplication...');

    // Detect duplicates
    const duplicateGroups = this.detectSimilarFlashcards(flashcards);

    // Track indices to keep
    const indicesToRemove = new Set<number>();

    for (const group of duplicateGroups) {
      // Keep the first card, mark rest for removal
      for (let i = 1; i < group.flashcards.length; i++) {
        indicesToRemove.add(group.flashcards[i].index);
      }
    }

    // Filter out duplicates
    const deduplicated = flashcards.filter((_, idx) => !indicesToRemove.has(idx));

    logInfo({
      agent: 'FlashcardGraph',
      phase: 'heuristic_deduplication_complete',
      originalCount: flashcards.length,
      duplicatesRemoved: indicesToRemove.size,
      remainingCount: deduplicated.length,
    }, `Removed ${indicesToRemove.size} duplicates`);

    // Select by semantic diversity
    return this.trimBySemanticDiversity(deduplicated, targetCount);
  }

  /**
   * Trim flashcards to target count while respecting semantic diversity.
   * Prioritizes removing duplicates and keeping diverse concepts.
   * Does NOT enforce strict topic limits - allows more cards on a topic if they test different concepts.
   */
  private trimBySemanticDiversity(flashcards: Flashcard[], targetCount: number): Flashcard[] {
    if (flashcards.length <= targetCount) {
      return flashcards;
    }

    logInfo({
      agent: 'FlashcardGraph',
      phase: 'trim_semantic_diversity',
      inputCount: flashcards.length,
      targetCount,
    }, 'Trimming with semantic diversity...');

    // Step 1: Detect duplicates and mark them for removal
    const duplicateGroups = this.detectSimilarFlashcards(flashcards);
    const indicesToRemove = new Set<number>();

    for (const group of duplicateGroups) {
      // Keep the first card, mark rest for removal
      for (let i = 1; i < group.flashcards.length; i++) {
        indicesToRemove.add(group.flashcards[i].index);
      }
    }

    // Step 2: Filter out duplicates
    const deduplicated = flashcards.filter((_, idx) => !indicesToRemove.has(idx));

    // Step 3: If still over count, select evenly from different topics
    if (deduplicated.length <= targetCount) {
      return deduplicated.slice(0, targetCount);
    }

    // Group by topic
    const topicGroups: Record<string, Flashcard[]> = {};
    for (const card of deduplicated) {
      const topic = this.extractTopic(card);
      if (!topicGroups[topic]) {
        topicGroups[topic] = [];
      }
      topicGroups[topic].push(card);
    }

    // Select evenly from each topic (prioritizing diversity, but allowing concentration on user's topic)
    const selected: Flashcard[] = [];
    const topics = Object.keys(topicGroups);

    // Take cards evenly from each topic
    const cardsPerTopic = Math.ceil(targetCount / topics.length);

    for (const topic of topics) {
      const cards = topicGroups[topic].slice(0, cardsPerTopic);
      selected.push(...cards);

      if (selected.length >= targetCount) {
        break;
      }
    }

    logInfo({
      agent: 'FlashcardGraph',
      phase: 'trim_semantic_diversity_complete',
      outputCount: selected.length,
      duplicatesRemoved: indicesToRemove.size,
      topicsRepresented: topics.length,
    }, `Trimmed to ${selected.length} cards with semantic diversity`);

    return selected.slice(0, targetCount);
  }

  // Extract topic from a flashcard for topic distribution logging
  private extractTopic(card: Flashcard): string {
    const question = card.front.toLowerCase();

    // Simple keyword-based topic extraction (generalized for all content types)
    if (question.includes('what is') || question.includes('define') || question.includes('definition')) return 'Definitions';
    if (question.includes('when') || question.includes('year') || question.includes('century') || question.includes('date')) return 'Timeline/Dates';
    if (question.includes('who') || question.includes('person') || question.includes('people')) return 'People';
    if (question.includes('where') || question.includes('place') || question.includes('location')) return 'Places';
    if (question.includes('why') || question.includes('because') || question.includes('reason') || question.includes('cause')) return 'Causes/Reasons';
    if (question.includes('how') || question.includes('process') || question.includes('method') || question.includes('step')) return 'Processes';
    if (question.includes('which') || question.includes('select') || question.includes('choose') || question.includes('identify')) return 'Classification';
    if (question.includes('true') || question.includes('false') || question.includes('correct')) return 'Facts';

    return 'General';
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
   */
  private detectSimilarFlashcards(flashcards: Flashcard[]): Array<{
    similarity: string;
    flashcards: Array<{index: number; front: string; back: string}>;
    reason: string;
  }> {
    const duplicates: Array<{
      similarity: string;
      flashcards: Array<{index: number; front: string; back: string}>;
      reason: string;
    }> = [];

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

    for (let i = 0; i < flashcards.length; i++) {
      for (let j = i + 1; j < flashcards.length; j++) {
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

    return duplicates;
  }

  /**
   * Node: Reduce phase
   */
  async reduce(state: OverallStateType): Promise<Partial<OverallStateType>> {
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
    state.collapsedOutputs.forEach((output, idx) => {
      const questionCount = output.split('Q:').length - 1;
      logInfo({
        agent: 'FlashcardGraph',
        phase: 'reduce_analyze_output',
        outputIndex: idx,
        outputCount: state.collapsedOutputs.length,
        outputLength: output.length,
        questionCount,
        preview: output.substring(0, 150).replace(/\n/g, ' '),
      });
    });

    const combined = state.collapsedOutputs.join('\n\n---\n\n');
    const totalQuestionsBefore = combined.split('Q:').length - 1;

    logInfo({
      agent: 'FlashcardGraph',
      phase: 'reduce_before_parsing',
      combinedLength: combined.length,
      totalQuestionsExtracted: totalQuestionsBefore,
    }, `Parsing ${totalQuestionsBefore} cards from map outputs for refinement...`);

    // Step 1: Parse all cards from map outputs
    const parsedFlashcards = this.fallbackParseFlashcards(combined);

    logInfo({
      agent: 'FlashcardGraph',
      phase: 'reduce_after_initial_parse',
      initialCardCount: parsedFlashcards.length,
    }, `Parsed ${parsedFlashcards.length} flashcards - running LLM refinement...`);

    // Step 2: ALWAYS run LLM refinement for quality control
    let finalFlashcards: Flashcard[];

    // If still no flashcards, this is a critical failure
    if (parsedFlashcards.length === 0) {
      logError({
        agent: 'FlashcardGraph',
        phase: 'reduce',
        error: 'No flashcards parsed',
        totalQuestionsBefore,
      }, `CRITICAL: No flashcards parsed despite ${totalQuestionsBefore} input questions!`);
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

    return {
      ...state,
      finalOutput: finalFlashcards,
      status: 'completed',
      progress: {
        phase: 'reduce',
        percentage: 100,
        message: `Completed: ${finalFlashcards.length} flashcards generated`,
        cardsGenerated: finalFlashcards.length,
      },
    };
  }

  /**
   * Cleans up the front text by removing formatting artifacts.
   * Enhanced to handle escaped quotes and markdown issues.
   */
  private cleanFrontText(front: string): string {
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
  private cleanBackText(back: string): string {
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

  // Parser for text-based flashcard output (Q: ... A: ... format)
  // Used in reduce phase to parse map outputs
  private fallbackParseFlashcards(content: string): Flashcard[] {
    logInfo({
      agent: 'FlashcardGraph',
      phase: 'fallback_parse',
      contentLength: content.length,
    }, 'Attempting manual parsing...');

    const flashcards: Flashcard[] = [];
    let failedParseCount = 0;
    let failedValidationCount = 0;

    const qaPattern = /Q:\s*(.+?)\s*A:\s*([\s\S]+?)(?=Q:|$)/g;
    let match: RegExpExecArray | null;

    while ((match = qaPattern.exec(content)) !== null) {
      let front = match[1].trim();
      let back = match[2].trim();

      // Clean up trailing artifacts from both front and back
      front = this.cleanFrontText(front);
      back = this.cleanBackText(back);

      if (front.length > 0 && back.length > 0) {
        const card: Flashcard = { front, back };

        // Validate that flashcard is self-contained
        if (!this.validateSelfContained(card)) {
          failedValidationCount++;
          continue; // Skip flashcards that aren't self-contained
        }

        flashcards.push(card);
      } else {
        failedParseCount++;
      }
    }

    logInfo({
      agent: 'FlashcardGraph',
      phase: 'fallback_parse_regex',
      extractedCount: flashcards.length,
    }, `Regex extraction: ${flashcards.length} cards`);

    logInfo({
      agent: 'FlashcardGraph',
      phase: 'fallback_parse_complete',
      extractedCount: flashcards.length,
      failedParseCount,
      failedValidationCount,
    }, `Extracted ${flashcards.length} flashcards (${failedParseCount} failed to parse, ${failedValidationCount} failed validation)`);

    return flashcards;
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
    builder.addNode('map_process', (s: ChunkProcessState) => mapProcess(s, this.fastLlm));
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
