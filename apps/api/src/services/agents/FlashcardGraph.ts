import { StateGraph, START, END, Send, Annotation } from '@langchain/langgraph';
import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { env } from '../../config/env.js';

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
} as const;

const GRAPH_CONFIG = {
  ...FLASHCARD_CONFIG,
} as const;

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

**Format each pair as:**
Q: [your question]
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

export function packChunks(chunks: string[], targetSize: number = FLASHCARD_CONFIG.MAP_CHUNK_SIZE): string[] {
  if (!chunks || chunks.length === 0) return [];

  console.log(`\n[FlashcardGraph] ===== CHUNK PACKING =====`);
  console.log(`[FlashcardGraph] Original chunks: ${chunks.length}`);
  console.log(`[FlashcardGraph] Target size: ${targetSize} chars per packed chunk`);

  const packed: string[] = [];
  const buffer: string[] = [];
  let bufferSize = 0;

  for (const chunk of chunks) {
    if (!chunk?.trim()) continue;
    const chunkSize = chunk.length + (buffer.length > 0 ? 2 : 0);

    if (bufferSize + chunkSize > targetSize && buffer.length > 0) {
      packed.push(buffer.join('\n\n'));
      buffer.length = 0;
      bufferSize = 0;
    }

    buffer.push(chunk);
    bufferSize += chunkSize;
  }

  if (buffer.length > 0) {
    packed.push(buffer.join('\n\n'));
  }

  const reduction = Math.round((1 - packed.length / chunks.length) * 100);
  console.log(`[FlashcardGraph] Packed into: ${packed.length} chunks (${reduction}% fewer API calls)`);

  return packed;
}

export function validateChunks(chunks: string[]): string[] {
  if (!chunks || chunks.length === 0) return [];

  console.log(`\n[FlashcardGraph] ===== INPUT VALIDATION =====`);
  console.log(`[FlashcardGraph] Input chunks: ${chunks.length}`);

  const validated = chunks
    .filter(c => c && typeof c === 'string')
    .map(c => c.slice(0, 50000))
    .filter(c => c.trim().length > 50);

  console.log(`[FlashcardGraph] Valid chunks: ${validated.length}`);
  console.log(`[FlashcardGraph] Filtered out: ${chunks.length - validated.length} (too short or invalid)`);

  return validated;
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

    // ============================================================
    // DEBUG: Map Phase - Processing Individual Chunk
    // ============================================================
    const chunkId = chunkIndex !== undefined ? `[Chunk ${chunkIndex + 1}]` : '[Chunk ?]';
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[FlashcardGraph] ===== MAP PROCESS PHASE ${chunkId} =====`);
    console.log('='.repeat(80));
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'map_process',
      chunkIndex: chunkIndex,
      chunkLength: chunk.length,
      chunkPreview: chunk.substring(0, 150).replace(/\n/g, ' '),
      targetCardCount: cardCount,
      cardsPerChunkTarget: cardsPerChunk,
      difficulty: difficulty,
      topic: topic || 'none',
    }, null, 2));

    const prompt = getMapPrompt({ chunk, cardCount, cardsPerChunk, difficulty, topic });

    console.log(`[FlashcardGraph] ${chunkId} Sending prompt to LLM (${prompt.length} chars)...`);

    const response = await this.fastLlm.invoke([
      new SystemMessage('You are a professional educator and content analyst.'),
      new HumanMessage(prompt),
    ]);

    const output = response.content.toString();
    const questionCount = output.split('Q:').length - 1;
    const elapsed = Date.now() - startTime;

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'map_process_complete',
      chunkIndex: chunkIndex,
      outputLength: output.length,
      questionsGenerated: questionCount,
      processingTimeMs: elapsed,
      outputPreview: output.substring(0, 200).replace(/\n/g, ' '),
    }, null, 2));

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

    const response = await this.smartLlm.invoke([
      new SystemMessage('You are a skilled content consolidator.'),
      new HumanMessage(prompt),
    ]);

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
    console.log(`[FlashcardGraph] refineFlashcardSelection: selecting ${targetCount} best cards from ${flashcards.length}`);

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
    const response = await structuredLlm.invoke([
      new SystemMessage('You are an expert curriculum designer creating DIVERSE study sets. Your goal is to spread selections across ALL topics, not cluster on one.'),
      new HumanMessage(prompt),
    ]);

    const selected = (response as FlashcardResponse).flashcards;
    console.log(`[FlashcardGraph] refineFlashcardSelection: selected ${selected.length} cards`);

    // Log topic distribution for debugging
    const topicGroups = this.groupFlashcardsByTopic(selected);
    console.log(`[FlashcardGraph] Topic distribution after refinement:`, JSON.stringify(topicGroups, null, 2));

    // Fallback: if parsing failed or returned wrong count, take first N
    if (selected.length === 0) {
      console.warn(`[FlashcardGraph] refineFlashcardSelection: parsing failed, using simple trim`);
      return flashcards.slice(0, targetCount);
    }

    // If still over limit, trim the excess (this shouldn't happen with a good prompt)
    if (selected.length > targetCount) {
      console.warn(`[FlashcardGraph] refineFlashcardSelection: got ${selected.length}, trimming to ${targetCount}`);
      return selected.slice(0, targetCount);
    }

    // If under limit, take what we got plus fill from end to avoid losing topics
    if (selected.length < targetCount) {
      console.warn(`[FlashcardGraph] refineFlashcardSelection: got ${selected.length}, adding ${targetCount - selected.length} more`);
      const remaining = flashcards.slice(-(targetCount - selected.length));
      return [...selected, ...remaining];
    }

    return selected;
  }

  // Fast refinement: no LLM call, just topic-based sampling
  private refineFlashcardSelectionFast(flashcards: Flashcard[], targetCount: number): Flashcard[] {
    console.log(`[FlashcardGraph] refineFlashcardSelectionFast: selecting ${targetCount} cards from ${flashcards.length} using topic-based sampling`);

    // Group cards by topic
    const topicGroups: Record<string, Flashcard[]> = {};
    for (const card of flashcards) {
      const topic = this.extractTopic(card);
      if (!topicGroups[topic]) topicGroups[topic] = [];
      topicGroups[topic].push(card);
    }

    const topics = Object.keys(topicGroups);
    console.log(`[FlashcardGraph] Found ${topics.length} topics:`, topics.map(t => `${t}(${topicGroups[t].length})`).join(', '));

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

    console.log(`[FlashcardGraph] Selected ${selected.length} cards with allocations:`,
      Object.entries(allocations).map(([t, n]) => `${t}:${n}`).join(', '));

    // Log distribution
    const finalDistribution = this.groupFlashcardsByTopic(selected);
    console.log(`[FlashcardGraph] Final topic distribution:`, JSON.stringify(finalDistribution, null, 2));

    return selected;
  }

  // Extract topic from a flashcard (copied from groupFlashcardsByTopic logic)
  private extractTopic(card: Flashcard): string {
    const question = card.front.toLowerCase();
    if (question.includes('julius caesar') || question.includes('caesar')) return 'Julius Caesar';
    if (question.includes('emperor') || question.includes('empire')) return 'Emperors/Empire';
    if (question.includes('colosseum') || question.includes('roman architecture') || question.includes('building')) return 'Architecture/Buildings';
    if (question.includes('battle') || question.includes('war') || question.includes('military')) return 'Military/Wars';
    if (question.includes('senate') || question.includes('republic') || question.includes('government')) return 'Government/Politics';
    if (question.includes('period') || question.includes('century') || question.includes('year') || question.includes('bc') || question.includes('ad')) return 'Timeline/Dates';
    if (question.includes('roman') || question.includes('rome')) return 'Roman History';
    return 'other';
  }

  // Helper method to group flashcards by topic for debugging
  private groupFlashcardsByTopic(flashcards: Flashcard[]): Record<string, number> {
    const topics: Record<string, number> = {};

    for (const card of flashcards) {
      // Simple topic extraction based on keywords in the question
      const question = card.front.toLowerCase();
      let topic = 'other';

      if (question.includes('julius caesar') || question.includes('caesar')) topic = 'Julius Caesar';
      else if (question.includes('emperor') || question.includes('empire')) topic = 'Emperors/Empire';
      else if (question.includes('colosseum') || question.includes('roman architecture') || question.includes('building')) topic = 'Architecture/Buildings';
      else if (question.includes('battle') || question.includes('war') || question.includes('military')) topic = 'Military/Wars';
      else if (question.includes('senate') || question.includes('republic') || question.includes('government')) topic = 'Government/Politics';
      else if (question.includes('roman') || question.includes('rome')) topic = 'Roman History';
      else if (question.includes('period') || question.includes('century') || question.includes('year') || question.includes('bc') || question.includes('ad')) topic = 'Timeline/Dates';

      topics[topic] = (topics[topic] || 0) + 1;
    }

    return topics;
  }

  // Node: Reduce phase
  async reduce(state: OverallStateType): Promise<Partial<OverallStateType>> {
    // ============================================================
    // DEBUG: Reduce Phase Analysis
    // ============================================================
    console.log(`\n${'='.repeat(80)}`);
    console.log('[FlashcardGraph] ===== REDUCE PHASE =====');
    console.log('='.repeat(80));

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'reduce',
      collapsedOutputsCount: state.collapsedOutputs.length,
      targetCardCount: state.cardCount,
      difficulty: state.difficulty,
      topic: state.topic,
    }, null, 2));

    // Log each collapsed output for analysis
    state.collapsedOutputs.forEach((output, idx) => {
      const questionCount = output.split('Q:').length - 1;
      console.log(`[FlashcardGraph] Collapsed output [${idx + 1}/${state.collapsedOutputs.length}]: ${output.length} chars, ~${questionCount} questions`);
      console.log(`  Preview: ${output.substring(0, 150).replace(/\n/g, ' ')}...`);
    });

    const combined = state.collapsedOutputs.join('\n\n---\n\n');
    const totalQuestionsBefore = combined.split('Q:').length - 1;

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'reduce_before_parsing',
      combinedLength: combined.length,
      totalQuestionsExtracted: totalQuestionsBefore,
    }, null, 2));

    console.log(`[FlashcardGraph] Skipping LLM reduce, parsing ${totalQuestionsBefore} cards directly from map outputs...`);

    // Parse directly from map outputs - no LLM call needed
    const flashcards = this.fallbackParseFlashcards(combined);
    console.log(`[FlashcardGraph] Parsed ${flashcards.length} flashcards from map outputs`);

    // Log topic distribution
    const topicDistribution = this.groupFlashcardsByTopic(flashcards);
    console.log(`[FlashcardGraph] Topic distribution:`, JSON.stringify(topicDistribution, null, 2));

    // Log all generated flashcards for analysis
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'reduce_after_parsing',
      flashcardsGenerated: flashcards.length,
      topicDistribution: topicDistribution,
      flashcards: flashcards.map((card, idx) => ({
        index: idx + 1,
        front: card.front,
        backLength: card.back.length,
        backPreview: card.back.substring(0, 100),
      })),
    }, null, 2));

    console.log(`[FlashcardGraph] Generated ${flashcards.length} flashcards (target: ${state.cardCount})`);

    // If still no flashcards, this is a critical failure
    if (flashcards.length === 0) {
      console.error(`[FlashcardGraph] CRITICAL: No flashcards generated despite ${totalQuestionsBefore} input questions!`);
      console.error(`[FlashcardGraph] This indicates the LLM failed to process the content or structured output failed.`);
      return {
        ...state,
        finalOutput: [],
        status: 'failed',
      };
    }

    // Post-processing: enforce exact card count
    if (flashcards.length > state.cardCount) {
      console.log(`[FlashcardGraph] Have ${flashcards.length} cards, need exactly ${state.cardCount}. Running fast topic-based refinement.`);
      const refined = this.refineFlashcardSelectionFast(flashcards, state.cardCount);

      // Log final refined cards
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        phase: 'reduce_final',
        finalFlashcardCount: refined.length,
        finalFlashcards: refined.map((card, idx) => ({
          index: idx + 1,
          front: card.front,
          backLength: card.back.length,
          backPreview: card.back.substring(0, 100),
        })),
      }, null, 2));

      console.log(`\n${'='.repeat(80)}`);
      console.log('[FlashcardGraph] ===== GENERATION COMPLETE =====');
      console.log('='.repeat(80));

      return {
        ...state,
        finalOutput: refined,
        status: 'completed',
      };
    }

    if (flashcards.length < state.cardCount) {
      console.log(`[FlashcardGraph] Generated ${flashcards.length} cards, target was ${state.cardCount}. Accepting fewer.`);
    }

    // Log final cards
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'reduce_final',
      finalFlashcardCount: flashcards.length,
      finalFlashcards: flashcards.map((card, idx) => ({
        index: idx + 1,
        front: card.front,
        backLength: card.back.length,
        backPreview: card.back.substring(0, 100),
      })),
    }, null, 2));

    console.log(`\n${'='.repeat(80)}`);
    console.log('[FlashcardGraph] ===== GENERATION COMPLETE =====');
    console.log('='.repeat(80));

    return {
      ...state,
      finalOutput: flashcards,
      status: 'completed',
    };
  }

  // Fallback parser for when structured output fails
  private fallbackParseFlashcards(content: string): Flashcard[] {
    console.log('[FlashcardGraph] fallbackParseFlashcards: attempting manual parsing...');

    const flashcards: Flashcard[] = [];
    const qaPattern = /Q:\s*(.+?)\s*A:\s*([\s\S]+?)(?=Q:|$)/g;
    let match: RegExpExecArray | null;

    while ((match = qaPattern.exec(content)) !== null) {
      const front = match[1].trim();
      const back = match[2].trim();

      if (front.length > 0 && back.length > 0) {
        flashcards.push({ front, back });
      }
    }

    console.log(`[FlashcardGraph] fallbackParseFlashcards: extracted ${flashcards.length} cards`);

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
            flashcards.push({ front: currentFront, back: currentBack });
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
        flashcards.push({ front: currentFront, back: currentBack.trim() });
      }

      console.log(`[FlashcardGraph] fallbackParseFlashcards (line-by-line): extracted ${flashcards.length} cards`);
    }

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
