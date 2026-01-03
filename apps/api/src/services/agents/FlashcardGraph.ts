import { StateGraph, START, END, Send, Annotation } from '@langchain/langgraph';
import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { env } from '../../config/env.js';

// Shared utilities for production-level patterns
import {
  invokeWithTimeout,
  invokeWithRetry,
  RetryConfig,
  RetryPolicies,
  packChunks as sharedPackChunks,
  validateChunks as sharedValidateChunks,
  ChunkConfig,
  logInfo,
  logWarn,
  logError,
  logPhaseStart,
  logPhaseComplete,
  logBanner,
  sanitizeUserInput,
  validateFlashcards,
} from './shared/index.js';

// ============================================================
// SCHEMAS
// ============================================================

const FlashcardArraySchema = z.object({
  flashcards: z.array(z.object({
    front: z.string(),
    back: z.string(),
  })),
});

export interface Flashcard {
  front: string;
  back: string;
}

export interface FlashcardResponse {
  flashcards: Flashcard[];
}

// ============================================================
// CONFIGURATION
// ============================================================

const FLASHCARD_CONFIG = {
  // Map phase: fast_llm (131K tokens) → 30K chars ≈ 7.5K tokens (~6% of context)
  MAP_CHUNK_SIZE: parseInt(env.FLASHCARD_MAP_CHUNK_SIZE || '30000', 10),
  // Reduce phase: smart_llm (261K tokens) → 60K chars ≈ 15K tokens (~6% of context)
  REDUCE_CHUNK_SIZE: parseInt(env.FLASHCARD_REDUCE_CHUNK_SIZE || '60000', 10),
  // Cards per chunk bounds
  MIN_CARDS_PER_CHUNK: parseInt(env.FLASHCARD_MIN_CARDS_PER_CHUNK || '2', 10),
  MAX_CARDS_PER_CHUNK: parseInt(env.FLASHCARD_MAX_CARDS_PER_CHUNK || '5', 10),
  // Minimum chunks to process
  MIN_CHUNKS: parseInt(env.FLASHCARD_MIN_CHUNKS || '3', 10),
  // Timeout settings for LLM calls
  MAP_TIMEOUT_MS: parseInt(env.FLASHCARD_MAP_TIMEOUT_MS || '180000', 10), // 3 minutes
  REDUCE_TIMEOUT_MS: parseInt(env.FLASHCARD_REDUCE_TIMEOUT_MS || '240000', 10), // 4 minutes
} as const;

const GRAPH_CONFIG = {
  ...FLASHCARD_CONFIG,
} as const;

// Problematic phrases that indicate flashcards aren't self-contained
// Only include phrases that are strong indicators of external content references
// Note: "the following" is intentionally excluded - it's commonly used in questions
const PROBLEMATIC_PHRASES = [
  'the diagram',
  'the above',
  'as shown',
  'this chart',
  'that example',
  'the table',
  'this figure',
] as const;

// State definitions using the newer Annotation API
export const OverallState = Annotation.Root({
  documentIds: Annotation<string[]>({
    reducer: (_x: string[], y?: string[]) => y ?? _x,
    default: () => [],
  }),
  chunks: Annotation<string[]>({
    reducer: (_x: string[], y?: string[]) => y ?? _x,
    default: () => [],
  }),
  cardCount: Annotation<number>({
    reducer: (_x: number, y?: number) => y ?? _x,
    default: () => 35, // standard default
  }),
  difficulty: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => 'medium',
  }),
  topic: Annotation<string | undefined>({
    reducer: (_x: string | undefined, y?: string | undefined) => y ?? _x,
    default: () => undefined,
  }),
  mapOutputs: Annotation<string[]>({
    // Reducer concatenates arrays - critical for aggregating parallel outputs
    // Fixed: handle undefined y to prevent runtime errors
    reducer: (x: string[], y?: string[]) => y ? x.concat(y) : x,
    default: () => [],
  }),
  collapsedOutputs: Annotation<string[]>({
    reducer: (_x: string[], y?: string[]) => y ?? _x,
    default: () => [],
  }),
  finalOutput: Annotation<Flashcard[]>({
    reducer: (_x: Flashcard[], y?: Flashcard[]) => y ?? _x,
    default: () => [],
  }),
  status: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => 'generating',
  }),
});

export type OverallStateType = typeof OverallState.State;

// Minimal state for parallel map processing - only what each chunk needs
export interface ChunkProcessState {
  chunk: string;
  chunkIndex?: number; // Track which chunk this is for debugging
  cardCount: number;
  difficulty: string;
  topic?: string;
  cardsPerChunk: number;
}

// Map prompt for generating Q&A pairs from chunks
const getMapPrompt = (params: {
  chunk: string;
  cardCount: number;
  cardsPerChunk: number;
  difficulty: string;
  topic?: string;
}): string => {
  const { chunk, cardCount, cardsPerChunk, difficulty, topic } = params;

  const difficultyGuidance: Record<string, string> = {
    easy: 'basic recall and definitions',
    medium: 'concepts and relationships',
    hard: 'application and analysis',
  };

  return `You are an expert educator creating HIGH-QUALITY & RELEVANT study flashcards from educational content.

HARD LIMIT: Generate ${cardsPerChunk} question-answer pairs maximum from this section. NOT more.
This is part of a larger set targeting ${cardCount} total cards across all chunks.

**Difficulty Level: ${difficulty.toUpperCase()}** (${difficultyGuidance[difficulty] || difficulty})
${topic ? `**Topic Focus:** ${topic}` : ''}

**Guidelines:**
- Questions should be clear, specific, and test understanding
- Answers should be concise but complete
- Focus on key concepts, definitions, and important relationships
- Avoid overly trivial or obvious questions

**SELF-CONTAINED FLASHCARDS REQUIREMENT:**
CRITICAL: Each flashcard question MUST BE COMPLETELY SELF-CONTAINED. The user will ONLY see the question and answer.

RULES FOR CONTEXT INCLUSION:
1. If a question references a diagram, chart, or visual element:
   - Describe it thoroughly within the question
   - Example: "In the ER diagram showing Entities A(id) and B(id) with a one-to-many relationship from A to B, what does the foreign key represent?"

2. If a question references a code snippet:
   - Include the relevant code in the question
   - Example: "Given the code 'function foo() { return 1; }', what does foo() return?"

3. If a question references a scenario/example:
   - Summarize the key details within the question
   - Example: "In a scenario where a user attempts login with invalid credentials, what response should the server return?"

4. NEVER use vague references like "the diagram", "the above", or "the following" without including the actual content
   - REWRITE to include the actual content being referenced

5. If context is too long (>300 chars):
   - Summarize the essential parts needed to answer
   - Example: "Given a database schema with Users(id, email) and Orders(user_id, total)..." instead of full schema

BALANCE: Questions should be complete but concise. Include only what's necessary to answer correctly.

**EXAMPLES OF SELF-CONTAINED FLASHCARDS:**

EXAMPLE 1 - Formula Reference:
Q: Using the formula F = ma, if a force of 100N is applied to a 10kg object, what is the acceleration?
A: 10 m/s² (a = F/m = 100N / 10kg = 10 m/s²)

EXAMPLE 2 - Code Reference:
Q: What does the following JavaScript code output? 'const arr = [1, 2, 3]; arr.push(4); console.log(arr.length);'
A: 4 (The push() method adds an element to the array, resulting in [1, 2, 3, 4], so length is 4)

EXAMPLE 3 - Context-Heavy Reference:
Q: A chemical reaction produces 50g of product from 100g of reactant. If the theoretical maximum yield is 80g, what is the percent yield?
A: 62.5% (Percent yield = (actual / theoretical) × 100 = (50g / 80g) × 100 = 62.5%)

**Format each pair as:**
Q: [your question text - COMPLETE AND SELF-CONTAINED with all necessary context]
A: [your answer]

Content:
${chunk}

FLASHCARDS:`;
};

// Reduce prompt for selecting and refining final flashcards
// SIMPLIFIED: With structured output, we don't need complex formatting instructions
const getReducePrompt = (params: {
  content: string;
  cardCount: number;
  difficulty: string;
  topic?: string;
}): string => {
  const { content, cardCount, difficulty, topic } = params;

  return `You are selecting flashcards for a study set. Your goal is to create a DIVERSE & HIGH-QUALITY set that covers ALL major topics.

CRITICAL REQUIREMENT - READ CAREFULLY:
You MUST select flashcards from DIFFERENT topics. Do NOT select more than 3 cards from any single topic.
If there are 6+ topics available, select 1-3 cards from each topic.
Your goal is MAXIMUM TOPIC DIVERSITY, not maximum cards on one topic.

TASK:
1. First, mentally identify 5-7 distinct topics in the content below
2. Then select ${cardCount} cards distributed EVENLY across those topics
3. Example: If you need 20 cards and have 5 topics, select 4 from each topic

Difficulty: ${difficulty}
${topic ? `User preference: ${topic} (but still maintain diversity)` : ''}

QUESTION-ANSWER PAIRS:
${content}

Select exactly ${cardCount} diverse flashcards:`;
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Wrapper around shared packChunks utility with FlashcardGraph logging.
 */
export function packChunks(chunks: string[], targetSize: number = FLASHCARD_CONFIG.MAP_CHUNK_SIZE): string[] {
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
    targetSize: FLASHCARD_CONFIG.MAP_CHUNK_SIZE, // Not used for validation but required by interface
    minChunkLength: 50,
    maxChunkLength: 50000,
    agentName: 'FlashcardGraph',
  });
}

export class FlashcardGraph {
  private fastLlm: ChatTogetherAI;
  private smartLlm: ChatTogetherAI;
  private maxTokens: number;

  constructor(apiKey: string, mapModel: string, reduceModel: string, maxTokens: number = 24000) {
    // Fast model for map phase (parallel Q&A generation)
    this.fastLlm = new ChatTogetherAI({
      apiKey,
      model: mapModel,
      temperature: 0.6,
    });

    // Smart model for reduce/collapse phases (selection and refinement)
    this.smartLlm = new ChatTogetherAI({
      apiKey,
      model: reduceModel,
      temperature: 0.5, // Lower temperature for more consistent selection
    });

    this.maxTokens = maxTokens;
  }

  private estimateTokens(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  // Generate a short hash for identifying chunks in logs
  private chunkHash(chunk: string): string {
    // First 50 chars + length + last 20 chars for identification
    const start = chunk.substring(0, 50).replace(/\n/g, ' ');
    const end = chunk.substring(Math.max(0, chunk.length - 20)).replace(/\n/g, ' ');
    return `[${chunk.length} chars] "${start}..."..."${end}"`;
  }

  // Node: Split chunks for routing
  splitChunks(state: OverallStateType): Partial<OverallStateType> {
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

    // Log each chunk with preview for source identification
    if (state.chunks && state.chunks.length > 0) {
      console.log(`\n[FlashcardGraph] Chunk breakdown:`);
      state.chunks.forEach((chunk, idx) => {
        const preview = this.chunkHash(chunk);
        console.log(`  [${idx + 1}/${state.chunks!.length}] ${preview.substring(0, 150)}...`);
      });
      console.log('');
    }

    return {
      ...state,
      status: 'mapping',
      mapOutputs: state.mapOutputs || [],
      collapsedOutputs: state.collapsedOutputs || [],
      finalOutput: state.finalOutput || [],
    };
  }

  // Conditional routing function - returns Send objects for fan-out or 'collapse' string
  routeToMap(state: OverallStateType): Send[] | 'collapse' {
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
    const packedChunks = packChunks(validatedChunks, GRAPH_CONFIG.MAP_CHUNK_SIZE);

    // Step 3: Intelligent target adjustment for edge cases
    let adjustedCardCount = state.cardCount;
    const maxPossibleCards = packedChunks.length * GRAPH_CONFIG.MAX_CARDS_PER_CHUNK;

    // If document is too small for requested card count, adjust target
    if (state.cardCount > maxPossibleCards) {
      console.warn(`[FlashcardGraph] ⚠️ Target adjustment: ${state.cardCount} cards requested, max possible: ${maxPossibleCards}`);
      adjustedCardCount = maxPossibleCards;
    }

    // Calculate cards per chunk, clamped to configured bounds
    const cardsPerChunk = Math.max(
      GRAPH_CONFIG.MIN_CARDS_PER_CHUNK,
      Math.min(GRAPH_CONFIG.MAX_CARDS_PER_CHUNK, Math.ceil(adjustedCardCount / packedChunks.length))
    );

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'route_to_map',
      originalChunks: state.chunks.length,
      validatedChunks: validatedChunks.length,
      packedChunks: packedChunks.length,
      originalTarget: state.cardCount,
      adjustedTarget: adjustedCardCount,
      cardsPerChunk,
      difficulty: state.difficulty,
      topic: state.topic,
    }, null, 2));

    console.log(`[FlashcardGraph] Creating ${packedChunks.length} parallel map tasks (~${cardsPerChunk} cards/chunk)`);

    // Create Send objects with adjusted values
    return packedChunks.map((chunk, idx) => {
      const preview = chunk.substring(0, 100).replace(/\n/g, ' ');
      console.log(`  [Task ${idx + 1}/${packedChunks.length}] ${preview}... (${chunk.length} chars)`);
      return new Send('map_process', {
        chunk,
        chunkIndex: idx,
        cardCount: adjustedCardCount,
        difficulty: state.difficulty,
        topic: state.topic,
        cardsPerChunk,
      });
    });
  }

  // Node: Map phase (runs in parallel via Send)
  async mapProcess(state: ChunkProcessState): Promise<Partial<OverallStateType>> {
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
          () => this.fastLlm.invoke([
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
    };
  }

  // Node: Collapse phase (if needed)
  async collapse(state: OverallStateType): Promise<Partial<OverallStateType>> {
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
      (sum, s) => sum + this.estimateTokens(s),
      0
    );

    console.log(`[FlashcardGraph] Total tokens: ${totalTokens}, Reduce chunk size: ${FLASHCARD_CONFIG.REDUCE_CHUNK_SIZE} chars`);

    // Use REDUCE_CHUNK_SIZE for collapse phase (smart_llm has larger context)
    const estimatedChars = totalTokens * 4;
    if (estimatedChars <= FLASHCARD_CONFIG.REDUCE_CHUNK_SIZE) {
      console.log('[FlashcardGraph] Collapse: skipping recursive collapse, using mapOutputs directly');
      return {
        ...state,
        collapsedOutputs: state.mapOutputs,
        status: 'reducing',
      };
    }

    // Recursive collapse
    console.log('[FlashcardGraph] Collapse: performing recursive collapse');
    const collapsed = await this.recursiveCollapse(state.mapOutputs);
    return {
      ...state,
      collapsedOutputs: collapsed,
      status: 'reducing',
    };
  }

  private async recursiveCollapse(outputs: string[]): Promise<string[]> {
    const totalTokens = outputs.reduce(
      (sum, s) => sum + this.estimateTokens(s),
      0
    );

    // Use REDUCE_CHUNK_SIZE for collapse phase (smart_llm has larger context)
    const estimatedChars = totalTokens * 4;
    if (estimatedChars <= FLASHCARD_CONFIG.REDUCE_CHUNK_SIZE) {
      return outputs;
    }

    // Dynamic grouping based on token budget
    const targetGroupTokens = FLASHCARD_CONFIG.REDUCE_CHUNK_SIZE * 0.8; // Leave 20% buffer
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

  // Refine flashcard selection when we have too many cards
  // Uses LLM to intelligently select the best cards while preserving topic coverage
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

    // Format flashcards for the prompt
    const flashcardsText = flashcards
      .map((card, index) => `${index + 1}. Q: ${card.front}\n   A: ${card.back}`)
      .join('\n\n');

    const prompt = `You are selecting flashcards for a study set. Your goal is MAXIMUM TOPIC DIVERSITY.

CRITICAL REQUIREMENT - READ CAREFULLY:
You MUST select flashcards from DIFFERENT topics. Do NOT select more than 3 cards from any single topic.
If there are 6+ topics available, select 1-3 cards from each topic.
Your goal is MAXIMUM TOPIC DIVERSITY, not maximum cards on one topic.

TASK:
1. First, mentally identify 5-7 distinct topics in the flashcards below
2. Then select ${targetCount} cards distributed EVENLY across those topics
3. Example: If you need 20 cards and have 5 topics, select 4 from each topic

From the ${flashcards.length} flashcards below, select exactly ${targetCount}.
${topic ? `User preference: ${topic} (but still maintain diversity)` : ''}

Available flashcards:
${flashcardsText}

Select exactly ${targetCount} diverse flashcards:`;

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

    // Fallback: if parsing failed or returned wrong count, take first N
    if (selected.length === 0) {
      logWarn({
        agent: 'FlashcardGraph',
        phase: 'refine_selection',
        issue: 'parsing_failed',
      }, 'Parsing failed, using simple trim');
      return flashcards.slice(0, targetCount);
    }

    // If still over limit, trim the excess (this shouldn't happen with a good prompt)
    if (selected.length > targetCount) {
      logWarn({
        agent: 'FlashcardGraph',
        phase: 'refine_selection',
        selectedCount: selected.length,
        targetCount,
      }, `Got ${selected.length}, trimming to ${targetCount}`);
      return selected.slice(0, targetCount);
    }

    // If under limit, take what we got plus fill from end to avoid losing topics
    if (selected.length < targetCount) {
      logWarn({
        agent: 'FlashcardGraph',
        phase: 'refine_selection',
        selectedCount: selected.length,
        targetCount,
      }, `Got ${selected.length}, adding ${targetCount - selected.length} more`);
      const remaining = flashcards.slice(-(targetCount - selected.length));
      return [...selected, ...remaining];
    }

    return selected;
  }

  // Fast refinement: no LLM call, just topic-based sampling
  private refineFlashcardSelectionFast(flashcards: Flashcard[], targetCount: number): Flashcard[] {
    logInfo({
      agent: 'FlashcardGraph',
      phase: 'refine_fast',
      totalFlashcards: flashcards.length,
      targetCount,
    }, `Selecting ${targetCount} cards from ${flashcards.length} using topic-based sampling`);

    // Group cards by topic
    const topicGroups: Record<string, Flashcard[]> = {};
    for (const card of flashcards) {
      const topic = this.extractTopic(card);
      if (!topicGroups[topic]) topicGroups[topic] = [];
      topicGroups[topic].push(card);
    }

    const topics = Object.keys(topicGroups);
    logInfo({
      agent: 'FlashcardGraph',
      phase: 'refine_fast_topics',
      topicCount: topics.length,
      topics: topics.map(t => `${t}(${topicGroups[t].length})`),
    }, `Found ${topics.length} topics`);

    // Allocate cards proportionally to topic sizes (min 1 per topic, max based on target/topics ratio)
    const totalCards = flashcards.length;
    const allocations: Record<string, number> = {};
    let allocated = 0;

    // Dynamic max: ensure we can reach target with all topics
    const maxPerTopic = Math.max(3, Math.ceil(targetCount / topics.length * 2));

    for (const topic of topics) {
      const topicSize = topicGroups[topic].length;
      const proportional = Math.round((topicSize / totalCards) * targetCount);
      // Min 1 for small topics, max to prevent domination, but allow enough to reach target
      allocations[topic] = Math.max(1, Math.min(maxPerTopic, proportional));
      allocated += allocations[topic];
    }

    // Adjust if we're off from target
    if (allocated < targetCount) {
      // Add more to larger topics first
      let deficit = targetCount - allocated;
      const sortedTopics = [...topics].sort((a, b) => topicGroups[b].length - topicGroups[a].length);
      for (const topic of sortedTopics) {
        if (deficit <= 0) break;
        if (allocations[topic] < topicGroups[topic].length) {
          const canAdd = Math.min(topicGroups[topic].length - allocations[topic], deficit);
          allocations[topic] += canAdd;
          deficit -= canAdd;
        }
      }
    } else if (allocated > targetCount) {
      // Reduce from larger topics first, but keep min 1
      let excess = allocated - targetCount;
      const sortedTopics = [...topics].sort((a, b) => topicGroups[b].length - topicGroups[a].length);
      for (const topic of sortedTopics) {
        if (excess <= 0) break;
        if (allocations[topic] > 1) {
          const canRemove = Math.min(allocations[topic] - 1, excess);
          allocations[topic] -= canRemove;
          excess -= canRemove;
        }
      }
    }

    // Sample from each topic according to allocation
    const selected: Flashcard[] = [];
    for (const topic of topics) {
      const cards = topicGroups[topic];
      const count = Math.min(allocations[topic], cards.length);
      const step = Math.floor(cards.length / count);
      for (let i = 0; i < count; i++) {
        selected.push(cards[i * step]);
      }
    }

    logInfo({
      agent: 'FlashcardGraph',
      phase: 'refine_fast_selected',
      selectedCount: selected.length,
      allocations,
    }, `Selected ${selected.length} cards`);

    // Log distribution
    const finalDistribution = this.groupFlashcardsByTopic(selected);
    logInfo({
      agent: 'FlashcardGraph',
      phase: 'refine_fast_distribution',
      finalDistribution,
    });

    return selected;
  }

  // Extract topic from a flashcard (copied from groupFlashcardsByTopic logic)
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

  // Node: Reduce phase
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
    }, `Skipping LLM reduce, parsing ${totalQuestionsBefore} cards directly from map outputs...`);

    // Parse directly from map outputs - no LLM call needed
    const flashcards = this.fallbackParseFlashcards(combined);

    // Log topic distribution
    const topicDistribution = this.groupFlashcardsByTopic(flashcards);
    logInfo({
      agent: 'FlashcardGraph',
      phase: 'reduce_after_parsing',
      flashcardsGenerated: flashcards.length,
      topicDistribution,
    }, `Parsed ${flashcards.length} flashcards from map outputs`);

    // Log all generated flashcards for analysis
    logInfo({
      agent: 'FlashcardGraph',
      phase: 'reduce_flashcards_detail',
      flashcards: flashcards.map((card, idx) => ({
        index: idx + 1,
        front: card.front,
        backLength: card.back.length,
        backPreview: card.back.substring(0, 100),
      })),
    });

    // Validate flashcard quality
    const validation = validateFlashcards(JSON.stringify(flashcards), state.cardCount);
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
      flashcardsGenerated: flashcards.length,
      targetCardCount: state.cardCount,
    }, `Generated ${flashcards.length} flashcards (target: ${state.cardCount})`);

    // If still no flashcards, this is a critical failure
    if (flashcards.length === 0) {
      logError({
        agent: 'FlashcardGraph',
        phase: 'reduce',
        error: 'No flashcards generated',
        totalQuestionsBefore,
      }, `CRITICAL: No flashcards generated despite ${totalQuestionsBefore} input questions!`);
      return {
        ...state,
        finalOutput: [],
        status: 'failed',
      };
    }

    // Post-processing: enforce exact card count
    if (flashcards.length > state.cardCount) {
      logInfo({
        agent: 'FlashcardGraph',
        phase: 'reduce_refinement',
        currentCount: flashcards.length,
        targetCount: state.cardCount,
      }, `Have ${flashcards.length} cards, need exactly ${state.cardCount}. Running fast topic-based refinement.`);

      const refined = this.refineFlashcardSelectionFast(flashcards, state.cardCount);

      // Log final refined cards
      logInfo({
        agent: 'FlashcardGraph',
        phase: 'reduce_final',
        finalFlashcardCount: refined.length,
        finalFlashcards: refined.map((card, idx) => ({
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
          finalFlashcardCount: refined.length,
          targetCardCount: state.cardCount,
        },
        'GENERATION COMPLETE'
      );

      return {
        ...state,
        finalOutput: refined,
        status: 'completed',
      };
    }

    if (flashcards.length < state.cardCount) {
      logWarn({
        agent: 'FlashcardGraph',
        phase: 'reduce',
        generatedCount: flashcards.length,
        targetCount: state.cardCount,
      }, `Generated ${flashcards.length} cards, target was ${state.cardCount}. Accepting fewer.`);
    }

    // Log final cards
    logInfo({
      agent: 'FlashcardGraph',
      phase: 'reduce_final',
      finalFlashcardCount: flashcards.length,
      finalFlashcards: flashcards.map((card, idx) => ({
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
        finalFlashcardCount: flashcards.length,
        targetCardCount: state.cardCount,
      },
      'GENERATION COMPLETE'
    );

    return {
      ...state,
      finalOutput: flashcards,
      status: 'completed',
    };
  }

  // Fallback parser for when structured output fails
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
      const front = match[1].trim();
      const back = match[2].trim();

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

    // If regex failed, try to extract from raw Q:/A: patterns individually
    if (flashcards.length === 0) {
      const lines = content.split('\n');
      let currentFront = '';
      let currentBack = '';

      for (const line of lines) {
        const qMatch = line.match(/^Q:\s*(.+)/);
        const aMatch = line.match(/^A:\s*(.+)/);

        if (qMatch) {
          if (currentFront && currentBack) {
            const card: Flashcard = { front: currentFront, back: currentBack.trim() };
            // Validate that flashcard is self-contained
            if (this.validateSelfContained(card)) {
              flashcards.push(card);
            } else {
              failedValidationCount++;
            }
          }
          currentFront = qMatch[1].trim();
          currentBack = '';
        } else if (aMatch) {
          currentBack += aMatch[1].trim() + ' ';
        } else if (currentFront && !currentBack) {
          // Continuation of answer
          currentBack += line.trim() + ' ';
        }
      }

      // Add the last card
      if (currentFront && currentBack) {
        const card: Flashcard = { front: currentFront, back: currentBack.trim() };
        // Validate that flashcard is self-contained
        if (this.validateSelfContained(card)) {
          flashcards.push(card);
        } else {
          failedValidationCount++;
        }
      }

      logInfo({
        agent: 'FlashcardGraph',
        phase: 'fallback_parse_line_by_line',
        extractedCount: flashcards.length,
      }, `Line-by-line extraction: ${flashcards.length} cards`);
    }

    logInfo({
      agent: 'FlashcardGraph',
      phase: 'fallback_parse_complete',
      extractedCount: flashcards.length,
      failedParseCount,
      failedValidationCount,
    }, `Extracted ${flashcards.length} flashcards (${failedParseCount} failed to parse, ${failedValidationCount} failed validation)`);

    return flashcards;
  }

  // Build the graph using the newer Annotation API
  buildGraph() {
    const builder = new StateGraph(OverallState);

    // Add nodes with proper types
    builder.addNode('split_chunks', (state: OverallStateType) => this.splitChunks(state));
    builder.addNode('map_process', (state: ChunkProcessState) => this.mapProcess(state));
    builder.addNode('collapse', (state: OverallStateType) => this.collapse(state));
    builder.addNode('reduce', (state: OverallStateType) => this.reduce(state));

    // Add edges - using as any for edge definitions (LangGraph JS TypeScript limitation)
    builder.addEdge(START, 'split_chunks' as any);

    // Conditional edge for Send API fan-out
    builder.addConditionalEdges(
      'split_chunks' as any,
      (state: OverallStateType) => this.routeToMap(state),
      { map_process: 'map_process', collapse: 'collapse' } as any
    );

    builder.addEdge('map_process' as any, 'collapse' as any);
    builder.addEdge('collapse' as any, 'reduce' as any);
    builder.addEdge('reduce' as any, END as any);

    return builder.compile();
  }
}
