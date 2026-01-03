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
  validateQuiz,
} from './shared/index.js';

// ============================================================
// SCHEMAS
// ============================================================

const QuizQuestionSchema = z.object({
  question: z.string(),
  options: z.array(z.string()).length(4), // exactly 4 options
  answer: z.number(), // index of correct option (0-3)
  hint: z.string(), // always required
  explanation: z.string(), // always required
});

const QuizQuestionArraySchema = z.object({
  questions: z.array(QuizQuestionSchema),
});

export interface QuizQuestion {
  question: string;
  options: string[];
  answer: number; // index of correct option
  hint: string;
  explanation: string;
}

export interface QuizQuestionResponse {
  questions: QuizQuestion[];
}

// ============================================================
// CONFIGURATION
// ============================================================

const GRAPH_CONFIG = {
  // Map phase: fast_llm (131K tokens) -> 20K chars (~5K tokens)
  MAP_CHUNK_SIZE: parseInt(env.QUIZ_MAP_CHUNK_SIZE || '20000', 10),
  // Reduce phase: smart_llm (261K tokens) -> 40K chars (~10K tokens)
  REDUCE_CHUNK_SIZE: parseInt(env.QUIZ_REDUCE_CHUNK_SIZE || '40000', 10),
  // Minimum questions per chunk (dynamic max is calculated based on chunk count)
  MIN_QUESTIONS_PER_CHUNK: 3,
  // Minimum chunks to process
  MIN_CHUNKS: 3,
  // Timeout settings for LLM calls
  MAP_TIMEOUT_MS: parseInt(env.QUIZ_MAP_TIMEOUT_MS || '180000', 10), // 3 minutes
  REDUCE_TIMEOUT_MS: parseInt(env.QUIZ_REDUCE_TIMEOUT_MS || '240000', 10), // 4 minutes
  // Collapse recursion limit to prevent infinite loops
  MAX_COLLAPSE_DEPTH: 5,
  // Minimum question block length for parsing (characters)
  MIN_QUESTION_BLOCK_LENGTH: 50,
  // Topic allocation multiplier for question refinement
  // Allows topics to take up to 2x their proportional share to ensure diversity
  TOPIC_ALLOCATION_MULTIPLIER: 2.0,
} as const;

// Problematic phrases that indicate questions aren't self-contained
// Only include phrases that are strong indicators of external content references
// Note: "the following" is intentionally excluded - it's commonly used in "Which of the following..." questions
const PROBLEMATIC_PHRASES = [
  'the diagram',
  'the above',
  'as shown',
  'this chart',
  'that example',
  'the table',
  'this figure',
] as const;

// ============================================================
// STATE DEFINITIONS
// ============================================================

export const OverallState = Annotation.Root({
  documentIds: Annotation<string[]>({
    reducer: (_x: string[], y?: string[]) => y ?? _x,
    default: () => [],
  }),
  chunks: Annotation<string[]>({
    reducer: (_x: string[], y?: string[]) => y ?? _x,
    default: () => [],
  }),
  questionCount: Annotation<number>({
    reducer: (_x: number, y?: number) => y ?? _x,
    default: () => 20, // standard default
  }),
  difficulty: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => 'medium',
  }),
  focus: Annotation<string | undefined>({
    reducer: (_x: string | undefined, y?: string | undefined) => y ?? _x,
    default: () => undefined,
  }),
  mapOutputs: Annotation<string[]>({
    reducer: (x: string[], y?: string[]) => y ? x.concat(y) : x,
    default: () => [],
  }),
  collapsedOutputs: Annotation<string[]>({
    reducer: (_x: string[], y?: string[]) => y ?? _x,
    default: () => [],
  }),
  finalOutput: Annotation<QuizQuestion[]>({
    reducer: (_x: QuizQuestion[], y?: QuizQuestion[]) => y ?? _x,
    default: () => [],
  }),
  status: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => 'generating',
  }),
  reduceRetryCount: Annotation<number>({
    reducer: (_x: number, y?: number) => y ?? _x,
    default: () => 0,
  }),
});

export type OverallStateType = typeof OverallState.State;

// Minimal state for parallel map processing
export interface ChunkProcessState {
  chunk: string;
  chunkIndex?: number;
  questionCount: number;
  difficulty: string;
  focus?: string;
  questionsPerChunk: number;
}

// ============================================================
// PROMPTS
// ============================================================

const getMapPrompt = (params: {
  chunk: string;
  questionCount: number;
  questionsPerChunk: number;
  difficulty: string;
  focus?: string;
}): string => {
  const { chunk, questionCount, questionsPerChunk, difficulty, focus } = params;

  const difficultyGuidance: Record<string, string> = {
    easy: 'basic recall and definitions - straightforward facts',
    medium: 'concepts and relationships - requires understanding',
    hard: 'application and analysis - requires deeper thinking',
  };

  return `You are an expert educator creating HIGH-QUALITY multiple-choice quiz questions from educational content.

REQUIRED OUTPUT: You MUST generate exactly ${questionsPerChunk} questions from this section.
This is part of a larger set targeting ${questionCount} total questions across all chunks.

**Difficulty Level: ${difficulty.toUpperCase()}** (${difficultyGuidance[difficulty] || difficulty})
${focus ? `**Topic Focus:** ${focus}` : ''}

CRITICAL REQUIREMENTS:
- You MUST output exactly ${questionsPerChunk} questions - no fewer, no more
- **EXACTLY 4 OPTIONS ONLY** - Each question MUST have exactly 4 options labeled A), B), C), D)
- **NO E) OPTION** - Never add a 5th option (E, F, etc.). Only A, B, C, D exist.
- Distractors (wrong options) must be plausible but clearly incorrect to someone who studied
- Avoid giving away the answer with obvious patterns (e.g., "All of the above")
- Hints must GUIDE thinking without revealing the answer - point to relevant concepts, ask leading questions, or suggest what to consider
- Explanations should clearly explain why the correct answer is right, connecting to key concepts

**SELF-CONTAINED QUESTIONS REQUIREMENT:**
CRITICAL: Each question MUST BE COMPLETELY SELF-CONTAINED. The user will ONLY see the question text and options.

RULES FOR CONTEXT INCLUSION:
1. If a question references a diagram, chart, or visual element:
   - Describe it thoroughly within the question
   - Example: "Based on the ER diagram showing Entities A(id) and B(id) with a one-to-many relationship from A to B..."

2. If a question references a code snippet:
   - Include the relevant code in the question
   - Example: "Consider this code: function foo() { return 1; } What does it return?"

3. If a question references a scenario/example:
   - Summarize the key details within the question
   - Example: "In a scenario where a user attempts login with invalid credentials..."

4. NEVER use vague references like "the diagram", "the following", or "the above" without including the actual content
   - REWRITE to include the actual content being referenced

5. If context is too long (>300 chars):
   - Summarize the essential parts needed to answer
   - Example: "Given a database schema with Users(id, email) and Orders(user_id, total)..." instead of full schema

BALANCE: Questions should be complete but concise. Include only what's necessary to answer correctly.

**Hint Guidelines (IMPORTANT):**
- DO NOT restate the answer in the hint
- DO provide conceptual guidance (e.g., "Consider the chronological order of events" or "Think about the geographical location mentioned")
- DO suggest what information to look for in the question
- DO use phrases like "Refer to...", "Recall that...", "Consider the..."

**Format each question as:**

EXAMPLE 1 - Formula Reference:
Q: Using the formula F = ma, if a force of 100N is applied to a 10kg object, what is the acceleration?
A) 0.1 m/s²
B) 10 m/s²
C) 100 m/s²
D) 1000 m/s²
ANSWER: B
HINT: Rearrange the formula to solve for acceleration: a = F/m
EXPLANATION: a = 100N / 10kg = 10 m/s²

EXAMPLE 2 - Code Reference:
Q: Consider this JavaScript code: const arr = [1, 2, 3]; arr.push(4); What is arr.length?
A) 3
B) 4
C) undefined
D) TypeError
ANSWER: B
HINT: The push() method adds an element to the array.
EXPLANATION: After push(4), the array contains [1, 2, 3, 4], so length is 4.

EXAMPLE 3 - Context-Heavy Reference:
Q: A reaction produces 50g of product from 100g of reactant. What is the percent yield if the theoretical maximum is 80g?
A) 37.5%
B) 50%
C) 62.5%
D) 80%
ANSWER: C
HINT: Percent yield = (actual / theoretical) × 100
EXPLANATION: (50g / 80g) × 100 = 62.5%

Your question:
Q: [your question text - COMPLETE AND SELF-CONTAINED with all necessary context]
A) [option 1]
B) [option 2]
C) [option 3]
D) [option 4]
ANSWER: [A/B/C/D]
HINT: [guiding hint that points to relevant concepts WITHOUT revealing the answer]
EXPLANATION: [why the correct answer is right, connecting to key concepts]

Content:
${chunk}

QUESTIONS:`;
};

const getReducePrompt = (params: {
  content: string;
  questionCount: number;
  difficulty: string;
  focus?: string;
}): string => {
  const { content, questionCount, difficulty, focus } = params;

  return `You are selecting quiz questions for a study set. Your goal is to create a DIVERSE & HIGH-QUALITY set that covers ALL major topics.

CRITICAL REQUIREMENT - READ CAREFULLY:
You MUST select questions from DIFFERENT topics. Do NOT select more than 2 questions from any single topic.
If there are 8+ topics available, select 1-2 questions from each topic.
Your goal is MAXIMUM TOPIC DIVERSITY, not maximum questions on one topic.

QUALITY FILTER:
- Prioritize questions that are self-contained (include all necessary context)
- Avoid questions with vague references like "the diagram", "the example", "the above", or "the following" without embedded context
- When selecting between similar questions, choose the one that includes more complete context

TASK:
1. First, mentally identify 6-10 distinct topics in the content below
2. Then select ${questionCount} questions distributed EVENLY across those topics
3. Example: If you need 20 questions and have 5 topics, select 4 from each topic

Difficulty: ${difficulty}
${focus ? `User preference: ${focus} (but still maintain diversity)` : ''}

IMPORTANT OUTPUT FORMAT REQUIREMENTS:
- Your output must contain EXACTLY ${questionCount} questions
- Start immediately with the first question - NO preamble, introduction, or summary
- End after the last question - NO postamble or closing statement
- Use the EXACT format shown below (each question must have Q:, A), B), C), D), ANSWER:, HINT:, EXPLANATION:)

EXPECTED FORMAT (copy this exactly):
Q: [question text]
A) [option 1]
B) [option 2]
C) [option 3]
D) [option 4]
ANSWER: [A/B/C/D]
HINT: [hint text]
EXPLANATION: [explanation text]

Q: [next question]
A) [option 1]
B) [option 2]
C) [option 3]
D) [option 4]
ANSWER: [A/B/C/D]
HINT: [hint text]
EXPLANATION: [explanation text]

[continue for all ${questionCount} questions]

AVAILABLE QUESTIONS:
${content}`;
};

// Stricter version of reduce prompt for retries when initial attempt fails
const getReducePromptStrict = (params: {
  content: string;
  questionCount: number;
  difficulty: string;
  focus?: string;
}): string => {
  const { content, questionCount, difficulty, focus } = params;

  return `You are selecting quiz questions for a study set.

CRITICAL: Your previous output was NOT in the correct format. Follow these instructions EXACTLY.

OUTPUT FORMAT RULES (MUST FOLLOW):
1. Start IMMEDIATELY with "Q:" - NO introduction, preamble, or summary
2. Each question MUST have exactly 4 options labeled A), B), C), D)
3. Each question MUST have ANSWER:, HINT:, and EXPLANATION: fields
4. Output EXACTLY ${questionCount} questions - no more, no less
5. End after the last question - NO closing statement

WRONG (do NOT do this):
❌ "Here are 30 questions..."
❌ "I have selected the following questions..."
❌ "Below is a diverse set..."
❌ Any introduction or conclusion text

CORRECT (do this instead):
✅ Q: What is...?
✅ A) Option 1
✅ B) Option 2
✅ C) Option 3
✅ D) Option 4
✅ ANSWER: A
✅ HINT: Consider...
✅ EXPLANATION: The correct answer...

Q: [next question]
A) [option]
...

DIFFERENT TOPICS REQUIRED: Select from different topics, max 2 per topic.

Difficulty: ${difficulty}
${focus ? `User preference: ${focus}` : ''}

AVAILABLE QUESTIONS:
${content}`;
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Wrapper around shared packChunks utility with QuizGraph logging.
 */
export function packChunks(chunks: string[], targetSize: number = GRAPH_CONFIG.MAP_CHUNK_SIZE): string[] {
  return sharedPackChunks(chunks, {
    targetSize,
    minChunkLength: 50,
    maxChunkLength: 50000,
    agentName: 'QuizGraph',
  });
}

/**
 * Wrapper around shared validateChunks utility with QuizGraph logging.
 */
export function validateChunks(chunks: string[]): string[] {
  return sharedValidateChunks(chunks, {
    targetSize: GRAPH_CONFIG.MAP_CHUNK_SIZE,
    minChunkLength: 50,
    maxChunkLength: 50000,
    agentName: 'QuizGraph',
  });
}

// ============================================================
// MAIN CLASS
// ============================================================

export class QuizGraph {
  private fastLlm: ChatTogetherAI;
  private smartLlm: ChatTogetherAI;

  constructor(apiKey: string, mapModel: string, reduceModel: string) {
    this.fastLlm = new ChatTogetherAI({
      apiKey,
      model: mapModel,
      temperature: 0.6,
    });

    this.smartLlm = new ChatTogetherAI({
      apiKey,
      model: reduceModel,
      temperature: 0.5,
    });
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private chunkHash(chunk: string): string {
    const start = chunk.substring(0, 50).replace(/\n/g, ' ');
    const end = chunk.substring(Math.max(0, chunk.length - 20)).replace(/\n/g, ' ');
    return `[${chunk.length} chars] "${start}..."..."${end}"`;
  }

  // Node: Split chunks for routing
  splitChunks(state: OverallStateType): Partial<OverallStateType> {
    console.log('\n' + '='.repeat(80));
    console.log('[QuizGraph] ===== SPLIT CHUNKS PHASE =====');
    console.log('='.repeat(80));
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'split_chunks',
      documentCount: state.documentIds?.length || 0,
      documentIds: state.documentIds || [],
      chunkCount: state.chunks?.length || 0,
      targetQuestionCount: state.questionCount,
      difficulty: state.difficulty,
      focus: state.focus || 'none',
    }, null, 2));

    return {
      ...state,
      status: 'mapping',
      mapOutputs: state.mapOutputs || [],
      collapsedOutputs: state.collapsedOutputs || [],
      finalOutput: state.finalOutput || [],
    };
  }

  // Conditional routing function
  routeToMap(state: OverallStateType): Send[] | 'collapse' {
    console.log('\n' + '='.repeat(80));
    console.log('[QuizGraph] ===== ROUTE TO MAP PHASE =====');
    console.log('='.repeat(80));

    if (state.chunks.length === 0) {
      console.warn('[QuizGraph] No chunks to process, routing to collapse');
      return 'collapse';
    }

    const validatedChunks = validateChunks(state.chunks);
    const packedChunks = packChunks(validatedChunks, GRAPH_CONFIG.MAP_CHUNK_SIZE);

    // Dynamic max questions per chunk: fewer chunks → higher max, more chunks → lower max
    // This ensures we can hit the target without over-generating when there are many chunks
    // Formula: target divided by chunks, with 1.5x buffer to account for under-generation
    const dynamicMaxPerChunk = Math.max(
      4, // Minimum max even with many chunks
      Math.min(12, Math.ceil(state.questionCount / packedChunks.length * 1.5))
    );

    let adjustedQuestionCount = state.questionCount;
    const maxPossibleQuestions = packedChunks.length * dynamicMaxPerChunk;

    if (state.questionCount > maxPossibleQuestions) {
      console.warn(`[QuizGraph] Target adjustment: ${state.questionCount} questions requested, max possible: ${maxPossibleQuestions}`);
      adjustedQuestionCount = maxPossibleQuestions;
    }

    const questionsPerChunk = Math.max(
      GRAPH_CONFIG.MIN_QUESTIONS_PER_CHUNK,
      Math.min(dynamicMaxPerChunk, Math.ceil(adjustedQuestionCount / packedChunks.length))
    );

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'route_to_map',
      originalChunks: state.chunks.length,
      validatedChunks: validatedChunks.length,
      packedChunks: packedChunks.length,
      originalTarget: state.questionCount,
      adjustedTarget: adjustedQuestionCount,
      dynamicMaxPerChunk,
      questionsPerChunk,
      maxPossible: packedChunks.length * dynamicMaxPerChunk,
      difficulty: state.difficulty,
      focus: state.focus,
    }, null, 2));

    console.log(`[QuizGraph] Creating ${packedChunks.length} parallel map tasks (~${questionsPerChunk} questions/chunk)`);

    return packedChunks.map((chunk, idx) => {
      const preview = chunk.substring(0, 100).replace(/\n/g, ' ');
      console.log(`  [Task ${idx + 1}/${packedChunks.length}] ${preview}... (${chunk.length} chars)`);
      return new Send('map_process', {
        chunk,
        chunkIndex: idx,
        questionCount: adjustedQuestionCount,
        difficulty: state.difficulty,
        focus: state.focus,
        questionsPerChunk,
      });
    });
  }

  // Node: Map phase (runs in parallel via Send)
  async mapProcess(state: ChunkProcessState): Promise<Partial<OverallStateType>> {
    const { chunk, chunkIndex, questionCount, difficulty, focus, questionsPerChunk } = state;
    const startTime = Date.now();

    const chunkId = chunkIndex !== undefined ? `[Chunk ${chunkIndex + 1}]` : '[Chunk ?]';

    // Structured logging start
    logPhaseStart({
      agent: 'QuizGraph',
      phase: 'map_process',
      chunkIndex,
      chunkLength: chunk.length,
      chunkPreview: chunk.substring(0, 150).replace(/\n/g, ' '),
      targetQuestionCount: questionCount,
      questionsPerChunkTarget: questionsPerChunk,
      difficulty,
      focus: focus || 'none',
    });

    // Sanitize user input (focus)
    const sanitizedFocus = focus ? sanitizeUserInput(focus) : undefined;
    const prompt = getMapPrompt({ chunk, questionCount, questionsPerChunk, difficulty, focus: sanitizedFocus });

    logInfo({
      agent: 'QuizGraph',
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
            new SystemMessage('You are a professional educator creating multiple-choice quiz questions.'),
            new HumanMessage(prompt),
          ]),
          GRAPH_CONFIG.MAP_TIMEOUT_MS,
          'QuizMap'
        ),
        {
          maxAttempts: 3,
          baseDelayMs: 1000,
          onRetry: (attempt, error) => {
            logWarn({
              agent: 'QuizGraph',
              phase: 'map_process',
              chunkIndex,
              attempt,
              error: error.message,
            }, `Retry attempt ${attempt}/3`);
          }
        },
        'QuizMap'
      );

      output = response.content.toString();
    } catch (error) {
      // Graceful fallback on permanent failure
      const errorContext = {
        agent: 'QuizGraph',
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

[Fallback: This chunk could not be processed due to timeout or error. The quiz generation will continue with other chunks.]`;
    }

    const questionsGenerated = output.split('Q:').length - 1;
    const elapsed = Date.now() - startTime;

    // Structured logging complete
    logPhaseComplete({
      agent: 'QuizGraph',
      phase: 'map_process',
      chunkIndex,
      outputLength: output.length,
      questionsGenerated,
      processingTimeMs: elapsed,
      outputPreview: output.substring(0, 200).replace(/\n/g, ' '),
    });

    return {
      mapOutputs: [output],
    };
  }

  // Node: Collapse phase (if needed)
  async collapse(state: OverallStateType): Promise<Partial<OverallStateType>> {
    console.log(`\n${'='.repeat(80)}`);
    console.log('[QuizGraph] ===== COLLAPSE PHASE =====');
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

    if (!state.mapOutputs || state.mapOutputs.length === 0) {
      logError({
        agent: 'QuizGraph',
        phase: 'collapse',
        error: 'No mapOutputs received',
      }, 'Collapse: ERROR - No mapOutputs received!');
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

    logInfo({
      agent: 'QuizGraph',
      phase: 'collapse',
      totalTokens,
      reduceChunkSize: GRAPH_CONFIG.REDUCE_CHUNK_SIZE,
    }, `Total tokens: ${totalTokens}, Reduce chunk size: ${GRAPH_CONFIG.REDUCE_CHUNK_SIZE} chars`);

    const estimatedChars = totalTokens * 4;
    if (estimatedChars <= GRAPH_CONFIG.REDUCE_CHUNK_SIZE) {
      logInfo({
        agent: 'QuizGraph',
        phase: 'collapse_skip',
        estimatedChars,
        reduceChunkSize: GRAPH_CONFIG.REDUCE_CHUNK_SIZE,
      }, 'Collapse: skipping recursive collapse, using mapOutputs directly');
      return {
        ...state,
        collapsedOutputs: state.mapOutputs,
        status: 'reducing',
      };
    }

    logInfo({
      agent: 'QuizGraph',
      phase: 'collapse_recursive',
      estimatedChars,
      reduceChunkSize: GRAPH_CONFIG.REDUCE_CHUNK_SIZE,
    }, 'Collapse: performing recursive collapse');
    const collapsed = await this.recursiveCollapse(state.mapOutputs);
    return {
      ...state,
      collapsedOutputs: collapsed,
      status: 'reducing',
    };
  }

  private async recursiveCollapse(outputs: string[], depth: number = 0): Promise<string[]> {
    // Prevent infinite loops with depth limit
    if (depth >= GRAPH_CONFIG.MAX_COLLAPSE_DEPTH) {
      logWarn({
        agent: 'QuizGraph',
        phase: 'recursive_collapse',
        depth,
        maxDepth: GRAPH_CONFIG.MAX_COLLAPSE_DEPTH,
        outputCount: outputs.length,
      }, `Max collapse depth (${GRAPH_CONFIG.MAX_COLLAPSE_DEPTH}) reached, returning current outputs`);
      return outputs;
    }

    const totalTokens = outputs.reduce(
      (sum, s) => sum + this.estimateTokens(s),
      0
    );

    const estimatedChars = totalTokens * 4;
    if (estimatedChars <= GRAPH_CONFIG.REDUCE_CHUNK_SIZE) {
      return outputs;
    }

    const targetGroupTokens = GRAPH_CONFIG.REDUCE_CHUNK_SIZE * 0.8;
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

    return this.recursiveCollapse(collapsed, depth + 1);
  }

  private async collapseGroup(group: string[]): Promise<string> {
    const combined = group.join('\n\n---\n\n');

    const prompt = `Condense these quiz questions into a consolidated set while retaining all unique and high-quality questions. Keep the exact same format:\n\n${combined}\n\nCONDENSED QUESTIONS:`;

    // Use timeout and retry for collapse operations
    const response = await invokeWithRetry(
      () => invokeWithTimeout(
        () => this.smartLlm.invoke([
          new SystemMessage('You are a skilled content consolidator.'),
          new HumanMessage(prompt),
        ]),
        GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
        'QuizCollapseGroup'
      ),
      {
        maxAttempts: 2,
        baseDelayMs: 1000,
      },
      'QuizCollapseGroup'
    );

    return response.content.toString();
  }

  // Node: Reduce phase
  async reduce(state: OverallStateType): Promise<Partial<OverallStateType> | Send> {
    // Structured logging start
    logPhaseStart({
      agent: 'QuizGraph',
      phase: 'reduce',
      collapsedOutputsCount: state.collapsedOutputs.length,
      targetQuestionCount: state.questionCount,
      difficulty: state.difficulty,
      focus: state.focus || 'none',
    });

    const combined = state.collapsedOutputs.join('\n\n---\n\n');
    const totalQuestionsBefore = combined.split('Q:').length - 1;

    // Determine if we should use LLM for intelligent selection
    // Skip LLM if we're close to target count (within 10%) OR if we have fewer questions than target
    // (asking LLM to output more questions than exist causes it to hallucinate malformed content)
    const shouldSkipLLM = (totalQuestionsBefore >= state.questionCount * 0.9 &&
                          totalQuestionsBefore <= state.questionCount * 1.1) ||
                          totalQuestionsBefore < state.questionCount;

    if (shouldSkipLLM) {
      const skipReason = totalQuestionsBefore < state.questionCount
        ? 'Fewer questions than target (LLM would hallucinate)'
        : 'Question count within acceptable range';

      logInfo({
        agent: 'QuizGraph',
        phase: 'reduce_skip_llm',
        combinedLength: combined.length,
        totalQuestionsExtracted: totalQuestionsBefore,
        targetQuestionCount: state.questionCount,
        reason: skipReason,
      }, `Skipping LLM reduce, parsing ${totalQuestionsBefore} questions directly from map outputs...`);

      const questions = this.fallbackParseQuizQuestions(combined);

      // Validate quiz quality
      const validation = validateQuiz(JSON.stringify(questions), state.questionCount);
      logInfo({
        agent: 'QuizGraph',
        phase: 'reduce_after_parsing',
        questionsParsed: questions.length,
        validation: {
          isValid: validation.isValid,
          warnings: validation.warnings,
          score: validation.score,
        },
      }, `Parsed ${questions.length} questions from map outputs`);

      logInfo({
        agent: 'QuizGraph',
        phase: 'reduce',
        questionsGenerated: questions.length,
        targetQuestionCount: state.questionCount,
      }, `Generated ${questions.length} questions (target: ${state.questionCount})`);

      if (questions.length === 0) {
        logError({
          agent: 'QuizGraph',
          phase: 'reduce',
          error: 'No questions generated',
          totalQuestionsBefore,
        }, `CRITICAL: No questions generated despite ${totalQuestionsBefore} input questions!`);
        return {
          ...state,
          finalOutput: [],
          status: 'failed',
        };
      }

      // Post-processing: enforce exact question count
      if (questions.length > state.questionCount) {
        logInfo({
          agent: 'QuizGraph',
          phase: 'reduce_refinement',
          currentCount: questions.length,
          targetCount: state.questionCount,
        }, `Have ${questions.length} questions, need exactly ${state.questionCount}. Running fast topic-based refinement.`);

        const refined = this.refineQuestionSelectionFast(questions, state.questionCount);

        // Log final refined questions
        logInfo({
          agent: 'QuizGraph',
          phase: 'reduce_final',
          finalQuestionCount: refined.length,
          finalQuestions: refined.map((q, idx) => ({
            index: idx + 1,
            question: q.question,
            optionsCount: q.options.length,
            answer: q.answer,
          })),
        });

        logBanner(
          {
            agent: 'QuizGraph',
            phase: 'generation_complete',
            finalQuestionCount: refined.length,
            targetQuestionCount: state.questionCount,
          },
          'GENERATION COMPLETE'
        );

        return {
          ...state,
          finalOutput: refined,
          status: 'completed',
        };
      }

      if (questions.length < state.questionCount) {
        logWarn({
          agent: 'QuizGraph',
          phase: 'reduce',
          generatedCount: questions.length,
          targetCount: state.questionCount,
        }, `Generated ${questions.length} questions, target was ${state.questionCount}. Accepting fewer.`);
      }

      // Log final questions
      logInfo({
        agent: 'QuizGraph',
        phase: 'reduce_final',
        finalQuestionCount: questions.length,
        finalQuestions: questions.map((q, idx) => ({
          index: idx + 1,
          question: q.question,
          optionsCount: q.options.length,
          answer: q.answer,
        })),
      });

      logBanner(
        {
          agent: 'QuizGraph',
          phase: 'generation_complete',
          finalQuestionCount: questions.length,
          targetQuestionCount: state.questionCount,
        },
        'GENERATION COMPLETE'
      );

      return {
        ...state,
        finalOutput: questions,
        status: 'completed',
      };
    }

    // Use smart LLM for intelligent selection
    const retryCount = state.reduceRetryCount ?? 0;

    logInfo({
      agent: 'QuizGraph',
      phase: 'reduce_llm_selection',
      totalQuestionsBefore,
      targetQuestionCount: state.questionCount,
      retryAttempt: retryCount + 1,
      reason: 'Question count outside acceptable range, using LLM for selection',
    }, `Using smart LLM for intelligent question selection from ${totalQuestionsBefore} questions [Attempt ${retryCount + 1}/2]...`);

    const sanitizedFocus = state.focus ? sanitizeUserInput(state.focus) : undefined;

    // Use stricter prompt on retries
    const prompt = retryCount > 0
      ? getReducePromptStrict({
          content: combined,
          questionCount: state.questionCount,
          difficulty: state.difficulty,
          focus: sanitizedFocus,
        })
      : getReducePrompt({
          content: combined,
          questionCount: state.questionCount,
          difficulty: state.difficulty,
          focus: sanitizedFocus,
        });

    let llmOutput: string;
    try {
      const response = await invokeWithRetry(
        () => invokeWithTimeout(
          () => this.smartLlm.invoke([
            new SystemMessage('You are a quiz curator selecting diverse, high-quality questions for study sets.'),
            new HumanMessage(prompt),
          ]),
          GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
          'QuizReduce'
        ),
        {
          maxAttempts: 2,
          baseDelayMs: 1000,
          onRetry: (attempt, error) => {
            logWarn({
              agent: 'QuizGraph',
              phase: 'reduce_llm_retry',
              attempt,
              error: error.message,
            }, `LLM reduce retry attempt ${attempt}/2`);
          }
        },
        'QuizReduce'
      );

      llmOutput = response.content.toString();

      logInfo({
        agent: 'QuizGraph',
        phase: 'reduce_llm_success',
        outputLength: llmOutput.length,
      }, `LLM selection completed, output: ${llmOutput.length} chars`);
    } catch (error) {
      // Fallback to parsing all questions if LLM fails
      logError({
        agent: 'QuizGraph',
        phase: 'reduce_llm_failed',
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
        } : String(error),
      }, `LLM reduce failed, falling back to direct parsing`);

      llmOutput = combined;
    }

    const questions = this.fallbackParseQuizQuestions(llmOutput);

    // Validate quiz quality
    const validation = validateQuiz(JSON.stringify(questions), state.questionCount);
    logInfo({
      agent: 'QuizGraph',
      phase: 'reduce_after_parsing',
      questionsParsed: questions.length,
      validation: {
        isValid: validation.isValid,
        warnings: validation.warnings,
        score: validation.score,
      },
    }, `Parsed ${questions.length} questions after LLM selection`);

    logInfo({
      agent: 'QuizGraph',
      phase: 'reduce',
      questionsGenerated: questions.length,
      targetQuestionCount: state.questionCount,
    }, `Generated ${questions.length} questions (target: ${state.questionCount})`);

    if (questions.length === 0) {
      // Retry with stricter prompt if we haven't exceeded max retries
      const MAXReduce_RETRIES = 1; // Allow 1 retry (total 2 attempts)
      if (retryCount < MAXReduce_RETRIES) {
        logWarn({
          agent: 'QuizGraph',
          phase: 'reduce',
          error: 'No questions parsed from LLM output',
          totalQuestionsBefore,
          currentAttempt: retryCount + 1,
        }, `LLM output produced 0 parsable questions. Retrying with stricter prompt...`);

        // Return a Send to re-route to reduce with incremented retry count
        return new Send('reduce', {
          ...state,
          reduceRetryCount: retryCount + 1,
        } as any);
      }

      // Final failure after all retries exhausted
      logError({
        agent: 'QuizGraph',
        phase: 'reduce',
        error: 'No questions generated after all retry attempts',
        totalQuestionsBefore,
        totalAttempts: retryCount + 1,
      }, `CRITICAL: No questions generated despite ${totalQuestionsBefore} input questions after ${retryCount + 1} attempts!`);
      return {
        ...state,
        finalOutput: [],
        status: 'failed',
      };
    }

    // Post-processing: enforce exact question count
    if (questions.length > state.questionCount) {
      logInfo({
        agent: 'QuizGraph',
        phase: 'reduce_refinement',
        currentCount: questions.length,
        targetCount: state.questionCount,
      }, `Have ${questions.length} questions, need exactly ${state.questionCount}. Running fast topic-based refinement.`);

      const refined = this.refineQuestionSelectionFast(questions, state.questionCount);

      // Log final refined questions
      logInfo({
        agent: 'QuizGraph',
        phase: 'reduce_final',
        finalQuestionCount: refined.length,
        finalQuestions: refined.map((q, idx) => ({
          index: idx + 1,
          question: q.question,
          optionsCount: q.options.length,
          answer: q.answer,
        })),
      });

      logBanner(
        {
          agent: 'QuizGraph',
          phase: 'generation_complete',
          finalQuestionCount: refined.length,
          targetQuestionCount: state.questionCount,
        },
        'GENERATION COMPLETE'
      );

      return {
        ...state,
        finalOutput: refined,
        status: 'completed',
      };
    }

    if (questions.length < state.questionCount) {
      logWarn({
        agent: 'QuizGraph',
        phase: 'reduce',
        generatedCount: questions.length,
        targetCount: state.questionCount,
      }, `Generated ${questions.length} questions, target was ${state.questionCount}. Accepting fewer.`);
    }

    // Log final questions
    logInfo({
      agent: 'QuizGraph',
      phase: 'reduce_final',
      finalQuestionCount: questions.length,
      finalQuestions: questions.map((q, idx) => ({
        index: idx + 1,
        question: q.question,
        optionsCount: q.options.length,
        answer: q.answer,
      })),
    });

    logBanner(
      {
        agent: 'QuizGraph',
        phase: 'generation_complete',
        finalQuestionCount: questions.length,
        targetQuestionCount: state.questionCount,
      },
      'GENERATION COMPLETE'
    );

    return {
      ...state,
      finalOutput: questions,
      status: 'completed',
    };
  }

  // Clean explanation field by removing LLM artifacts
  private cleanExplanation(explanation: string): string {
    if (!explanation) return 'The correct answer follows from the material.';

    let cleaned = explanation.trim();

    // Remove trailing "---" patterns
    cleaned = cleaned.replace(/---\s*$/gm, '');
    cleaned = cleaned.replace(/\n---\n[\s\S]*$/g, '');

    // Remove trailing LLM artifacts like "Here are X multiple-choice questions..."
    cleaned = cleaned.replace(/\n\nHere are \d+ multiple[- ]choice quiz questions based on.*/gi, '');
    cleaned = cleaned.replace(/\n\nHere are \d+ questions based on.*/gi, '');

    // Remove other common LLM artifacts
    cleaned = cleaned.replace(/\n\n---\n\n/g, '\n');
    cleaned = cleaned.replace(/---$/gm, '');

    // Clean up any double newlines left over
    cleaned = cleaned.replace(/\n\n\n+/g, '\n\n');

    return cleaned.trim();
  }

  /**
   * Validate that a question is self-contained (doesn't reference external content)
   * Returns true if the question is self-contained, false if it has problematic phrases.
   *
   * Smart validation: Only reject questions that are BOTH short (<150 chars) AND have problematic phrases.
   * Longer questions likely include the necessary context embedded.
   */
  private validateSelfContained(question: QuizQuestion): boolean {
    const text = question.question.toLowerCase();
    const hasProblematicPhrase = PROBLEMATIC_PHRASES.some(phrase => text.includes(phrase));
    const isShort = text.length < 150;

    // Only reject if both short AND has problematic phrases
    // (longer questions likely have context embedded despite the phrases)
    const shouldReject = hasProblematicPhrase && isShort;

    if (shouldReject) {
      logWarn({
        agent: 'QuizGraph',
        phase: 'validate_self_contained',
        questionPreview: question.question.substring(0, 100),
        questionLength: text.length,
        foundPhrases: PROBLEMATIC_PHRASES.filter(phrase => text.includes(phrase)),
      }, 'Question rejected: short with potential external references');
    } else if (hasProblematicPhrase && !isShort) {
      logInfo({
        agent: 'QuizGraph',
        phase: 'validate_self_contained_accept',
        questionPreview: question.question.substring(0, 100),
        questionLength: text.length,
        foundPhrases: PROBLEMATIC_PHRASES.filter(phrase => text.includes(phrase)),
      }, 'Question accepted: has phrases but is long enough to include context');
    }

    return !shouldReject;
  }

  // Fallback parser for quiz questions
  private fallbackParseQuizQuestions(content: string): QuizQuestion[] {
    logInfo({
      agent: 'QuizGraph',
      phase: 'fallback_parse',
      contentLength: content.length,
    }, 'Attempting manual parsing...');

    const questions: QuizQuestion[] = [];
    let failedParseCount = 0;
    let failedValidationCount = 0;

    // Split by Q: markers
    const questionBlocks = content.split(/Q:\s*/).filter(block => block.trim().length > GRAPH_CONFIG.MIN_QUESTION_BLOCK_LENGTH);

    for (const block of questionBlocks) {
      try {
        const questionText = block.split(/\n[A]\)|\nA\)/)[0]?.trim() || '';
        if (!questionText) continue;

        // Extract options - Fixed duplicate regex pattern
        const optionsMatch = block.match(/A\)\s*([\s\S]+?)(?:\nB\)|\nB\))/);
        const optionA = optionsMatch?.[1]?.trim() || '';

        const bMatch = block.match(/B\)\s*([\s\S]+?)(?:\nC\)|\nC\))/);
        const optionB = bMatch?.[1]?.trim() || '';

        const cMatch = block.match(/C\)\s*([\s\S]+?)(?:\nD\)|\nD\))/);
        const optionC = cMatch?.[1]?.trim() || '';

        const dMatch = block.match(/D\)\s*([\s\S]+?)(?:\nANSWER:|\nANSWER\))/);
        const optionD = dMatch?.[1]?.trim() || '';

        // Validate that we have exactly 4 non-empty options
        const options = [optionA, optionB, optionC, optionD];
        const validOptionsCount = options.filter(o => o.length > 0).length;

        if (validOptionsCount !== 4) {
          failedParseCount++;
          logWarn({
            agent: 'QuizGraph',
            phase: 'fallback_parse_validation',
            questionPreview: questionText.substring(0, 100),
            optionsFound: validOptionsCount,
          }, `Question has invalid number of options (${validOptionsCount}/4), skipping`);
          continue;
        }

        // Extract answer
        const answerMatch = block.match(/ANSWER:\s*([ABCD])/i);
        const answerLetter = answerMatch?.[1]?.toUpperCase();
        const answerMap: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
        const answerIndex = answerLetter ? answerMap[answerLetter] : 0;

        // Extract hint
        const hintMatch = block.match(/HINT:\s*([\s\S]+?)(?:\nEXPLANATION:|\nEXPLANATION\))/);
        const hint = hintMatch?.[1]?.trim() || 'Consider the key concepts in this question.';

        // Extract explanation
        const explanationMatch = block.match(/EXPLANATION:\s*([\s\S]+?)(?=\nQ:|\n\nQ:|$)/);
        const rawExplanation = explanationMatch?.[1]?.trim() || 'The correct answer follows from the material.';
        const explanation = this.cleanExplanation(rawExplanation);

        const question: QuizQuestion = {
          question: questionText,
          options: [optionA, optionB, optionC, optionD],
          answer: answerIndex,
          hint,
          explanation,
        };

        // Validate that question is self-contained
        if (!this.validateSelfContained(question)) {
          failedValidationCount++;
          continue; // Skip questions that aren't self-contained
        }

        questions.push(question);
      } catch (e) {
        failedParseCount++;
        logWarn({
          agent: 'QuizGraph',
          phase: 'fallback_parse_error',
          error: e instanceof Error ? e.message : String(e),
        }, 'Failed to parse question block');
      }
    }

    logInfo({
      agent: 'QuizGraph',
      phase: 'fallback_parse_complete',
      extractedCount: questions.length,
      failedParseCount,
      failedValidationCount,
      totalBlocks: questionBlocks.length,
    }, `Extracted ${questions.length} questions (${failedParseCount} failed to parse, ${failedValidationCount} failed validation)`);

    return questions;
  }

  // Fast refinement: topic-based sampling
  private refineQuestionSelectionFast(questions: QuizQuestion[], targetCount: number): QuizQuestion[] {
    logInfo({
      agent: 'QuizGraph',
      phase: 'refine_fast',
      totalQuestions: questions.length,
      targetCount,
    }, `Selecting ${targetCount} questions from ${questions.length} using topic-based sampling`);

    // Group questions by topic (simple keyword extraction)
    const topicGroups: Record<string, QuizQuestion[]> = {};
    for (const q of questions) {
      const topic = this.extractTopic(q);
      if (!topicGroups[topic]) topicGroups[topic] = [];
      topicGroups[topic].push(q);
    }

    const topics = Object.keys(topicGroups);
    logInfo({
      agent: 'QuizGraph',
      phase: 'refine_fast_topics',
      topicCount: topics.length,
      topics: topics.map(t => `${t}(${topicGroups[t].length})`),
    }, `Found ${topics.length} topics`);

    // Allocate questions proportionally
    const allocations: Record<string, number> = {};
    let allocated = 0;
    const maxPerTopic = Math.max(
      2,
      Math.ceil(targetCount / topics.length * GRAPH_CONFIG.TOPIC_ALLOCATION_MULTIPLIER)
    );

    for (const topic of topics) {
      const topicSize = topicGroups[topic].length;
      const proportional = Math.round((topicSize / questions.length) * targetCount);
      allocations[topic] = Math.max(1, Math.min(maxPerTopic, proportional));
      allocated += allocations[topic];
    }

    // Adjust allocation
    if (allocated < targetCount) {
      let deficit = targetCount - allocated;
      const sortedTopics = [...topics].sort((a, b) => topicGroups[b].length - topicGroups[a].length);
      for (const topic of sortedTopics) {
        if (deficit <= 0) break;
        const canAdd = Math.min(topicGroups[topic].length - allocations[topic], deficit);
        allocations[topic] += canAdd;
        deficit -= canAdd;
      }
    }

    // Sample from each topic
    const selected: QuizQuestion[] = [];
    for (const topic of topics) {
      const qs = topicGroups[topic];
      const count = Math.min(allocations[topic], qs.length);
      const step = Math.floor(qs.length / count);
      for (let i = 0; i < count; i++) {
        selected.push(qs[i * step]);
      }
    }

    // Trim or fill as needed
    const finalSelected = selected.length > targetCount ? selected.slice(0, targetCount) : selected;

    logInfo({
      agent: 'QuizGraph',
      phase: 'refine_fast_selected',
      selectedCount: finalSelected.length,
      allocations,
    }, `Selected ${finalSelected.length} questions`);

    return finalSelected;
  }

  private extractTopic(question: QuizQuestion): string {
    const text = question.question.toLowerCase();

    // Simple keyword-based topic extraction
    if (text.includes('what is') || text.includes('define') || text.includes('definition')) return 'Definitions';
    if (text.includes('when') || text.includes('year') || text.includes('century')) return 'Timeline/Dates';
    if (text.includes('who') || text.includes('person') || text.includes('people')) return 'People';
    if (text.includes('where') || text.includes('place') || text.includes('location')) return 'Places';
    if (text.includes('why') || text.includes('because') || text.includes('reason')) return 'Causes/Reasons';
    if (text.includes('how') || text.includes('process') || text.includes('method')) return 'Processes';
    if (text.includes('which') || text.includes('select') || text.includes('choose')) return 'Classification';
    if (text.includes('true') || text.includes('false') || text.includes('correct')) return 'Facts';

    return 'General';
  }

  // Build the graph
  buildGraph() {
    const builder = new StateGraph(OverallState);

    builder.addNode('split_chunks', (state: OverallStateType) => this.splitChunks(state));
    builder.addNode('map_process', (state: ChunkProcessState) => this.mapProcess(state));
    builder.addNode('collapse', (state: OverallStateType) => this.collapse(state));
    builder.addNode('reduce', (state: OverallStateType) => this.reduce(state));

    builder.addEdge(START, 'split_chunks' as any);

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
