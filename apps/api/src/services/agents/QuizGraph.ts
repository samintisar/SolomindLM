import { StateGraph, START, END, Send, Annotation } from '@langchain/langgraph';
import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { env } from '../../config/env.js';

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
  validateQuiz,
} from './shared/index.js';

// ============================================================
// SCHEMAS
// ============================================================

const QuizQuestionSchema = z.object({
  question: z.string().describe('The complete question text'),
  options: z.array(z.string()).length(4).describe('Exactly 4 options for the question'),
  answer: z.number().describe('Index of correct option (0-3)'),
  hint: z.string().describe('A helpful hint that guides without revealing the answer'),
  explanation: z.string().describe('Explanation of why the correct answer is right'),
});

const QuizQuestionArraySchema = z.object({
  questions: z.array(QuizQuestionSchema).describe('Array of quiz questions'),
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
  // Topic allocation multiplier for question refinement
  // Allows topics to take up to 2x their proportional share to ensure diversity
  TOPIC_ALLOCATION_MULTIPLIER: 2.0,
} as const;

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
  // Progress tracking for streaming
  progress: Annotation<{
    phase: string;
    percentage: number;
    message: string;
    chunksCompleted?: number;
    totalChunks?: number;
    questionsGenerated?: number;
  }>({
    reducer: (_x, y?: any) => y ?? _x,
    default: () => ({ phase: 'initializing', percentage: 0, message: 'Initializing...' }),
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

TARGET: Generate exactly ${questionsPerChunk} questions from this section (part of ${questionCount} total questions).

**Difficulty: ${difficulty.toUpperCase()}** (${difficultyGuidance[difficulty] || difficulty})
${focus ? `**Focus:** ${focus}` : ''}

REQUIREMENTS:
- Each question MUST have exactly 4 options
- Distractors must be plausible but clearly incorrect
- Avoid obvious patterns like "All of the above"
- Hints must guide without revealing the answer
- Questions MUST be self-contained (include all necessary context)

**SELF-CONTAINED QUESTIONS:**
If a question references diagrams, code, or scenarios:
- Include the relevant content IN the question
- NEVER use vague references like "the diagram" or "the following" without context
- Example: BAD → "In the diagram shown..."  GOOD → "In the ER diagram with Entities A(id) and B(id)..."

**HINT GUIDELINES:**
- Point to relevant concepts without giving the answer
- Use phrases like "Consider...", "Recall that...", "Think about..."
- Examples: "Consider the order of operations" or "Recall the definition of..."

**EXPLANATION GUIDELINES:**
- Explain WHY the correct answer is right
- Connect to key concepts from the material

Content to create questions from:
${chunk}`;
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
      temperature: 0.4, // Moderate temp for question variety
      maxTokens: 16000, // Enough for quiz questions with options
    });

    this.smartLlm = new ChatTogetherAI({
      apiKey,
      model: reduceModel,
      temperature: 0.3, // Lower temp for consistent selection
      maxTokens: 24000, // Enough for final quiz selection
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
      progress: {
        phase: 'split_chunks',
        percentage: 5,
        message: `Preparing ${state.chunks?.length || 0} chunks for processing`,
        totalChunks: state.chunks?.length || 0,
      },
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
      // Use structured output for reliable question generation
      const structuredLlm = this.fastLlm.withStructuredOutput<QuizQuestionResponse>(
        QuizQuestionArraySchema,
        { name: 'quiz_questions' }
      );

      // Timeout + Retry wrapper for resilient LLM calls
      const response: QuizQuestionResponse = await invokeWithRetry(
        () => invokeWithTimeout(
          () => structuredLlm.invoke([
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

      // Serialize questions as JSON for downstream processing
      output = JSON.stringify(response.questions);
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

      output = '[]'; // Return empty array on failure
    }

    // Parse to count questions
    let questionsGenerated = 0;
    try {
      const parsed = JSON.parse(output) as QuizQuestion[];
      questionsGenerated = parsed.length;
    } catch {
      questionsGenerated = 0;
    }

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
      progress: {
        phase: 'map_process',
        percentage: Math.min(10 + ((chunkIndex ?? 0) * 30), 60),
        message: `Chunk ${(chunkIndex ?? 0) + 1} complete: ${questionsGenerated} questions`,
        chunksCompleted: (chunkIndex ?? 0) + 1,
      },
    };
  }

  // Node: Collapse phase (if needed)
  async collapse(state: OverallStateType): Promise<Partial<OverallStateType>> {
    console.log(`\n${'='.repeat(80)}`);
    console.log('[QuizGraph] ===== COLLAPSE PHASE =====');
    console.log('='.repeat(80));

    // Parse map outputs to count questions
    const mapOutputsDetails = state.mapOutputs.map((output, idx) => {
      let questions = 0;
      try {
        const parsed = JSON.parse(output) as QuizQuestion[];
        questions = parsed.length;
      } catch {
        questions = 0;
      }
      return {
        index: idx,
        length: output.length,
        questions,
        preview: output.substring(0, 100).replace(/\n/g, ' '),
      };
    });

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'collapse',
      mapOutputsReceived: state.mapOutputs.length,
      mapOutputsDetails,
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
        progress: {
          phase: 'collapse',
          percentage: 70,
          message: `Collected ${state.mapOutputs.length} chunk outputs`,
        },
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
      progress: {
        phase: 'collapse',
        percentage: 70,
        message: `Collapsed ${state.mapOutputs.length} outputs into ${collapsed.length}`,
      },
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
    // Parse and merge all question arrays
    const allQuestions: QuizQuestion[] = [];
    for (const output of group) {
      try {
        const parsed = JSON.parse(output) as QuizQuestion[];
        allQuestions.push(...parsed);
      } catch (e) {
        logWarn({
          agent: 'QuizGraph',
          phase: 'collapse_group_parse_error',
          error: e instanceof Error ? e.message : String(e),
        }, 'Failed to parse question array in collapseGroup');
      }
    }

    // Return merged array as JSON
    return JSON.stringify(allQuestions);
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

    // Parse all question arrays from collapsed outputs
    const allQuestions: QuizQuestion[] = [];
    for (const output of state.collapsedOutputs) {
      try {
        const parsed = JSON.parse(output) as QuizQuestion[];
        allQuestions.push(...parsed);
      } catch (e) {
        logWarn({
          agent: 'QuizGraph',
          phase: 'reduce_parse_error',
          error: e instanceof Error ? e.message : String(e),
        }, 'Failed to parse question array in reduce');
      }
    }

    const totalQuestionsBefore = allQuestions.length;

    // If we have no questions, fail
    if (totalQuestionsBefore === 0) {
      logError({
        agent: 'QuizGraph',
        phase: 'reduce',
        error: 'No questions generated',
      }, 'CRITICAL: No questions in collapsed outputs!');
      return {
        ...state,
        finalOutput: [],
        status: 'failed',
      };
    }

    // Determine if we should use LLM for intelligent selection
    // Skip LLM if we're close to target count (within 10%) OR if we have fewer questions than target
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
        totalQuestionsExtracted: totalQuestionsBefore,
        targetQuestionCount: state.questionCount,
        reason: skipReason,
      }, `Skipping LLM reduce, using ${totalQuestionsBefore} questions directly...`);

      return this.finalizeQuestions(allQuestions, state);
    }

    // Use smart LLM for intelligent selection with structured output
    const retryCount = state.reduceRetryCount ?? 0;

    logInfo({
      agent: 'QuizGraph',
      phase: 'reduce_llm_selection',
      totalQuestionsBefore,
      targetQuestionCount: state.questionCount,
      retryAttempt: retryCount + 1,
      reason: 'Question count outside acceptable range, using LLM for selection',
    }, `Using smart LLM for intelligent question selection from ${totalQuestionsBefore} questions [Attempt ${retryCount + 1}/2]...`);

    try {
      // Use structured output for reliable question selection
      const structuredLlm = this.smartLlm.withStructuredOutput<QuizQuestionResponse>(
        QuizQuestionArraySchema,
        { name: 'quiz_selection' }
      );

      // Create a simplified prompt for selection
      const selectionPrompt = this.getSelectionPrompt({
        questions: allQuestions,
        targetCount: state.questionCount,
        difficulty: state.difficulty,
        focus: state.focus,
      });

      const response: QuizQuestionResponse = await invokeWithRetry(
        () => invokeWithTimeout(
          () => structuredLlm.invoke([
            new SystemMessage('You are a quiz curator selecting diverse, high-quality questions for study sets.'),
            new HumanMessage(selectionPrompt),
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

      logInfo({
        agent: 'QuizGraph',
        phase: 'reduce_llm_success',
        selectedCount: response.questions.length,
      }, `LLM selection completed, selected ${response.questions.length} questions`);

      if (response.questions.length === 0) {
        throw new Error('LLM returned zero questions');
      }

      return this.finalizeQuestions(response.questions, state);
    } catch (error) {
      // Fallback to direct selection if LLM fails
      logError({
        agent: 'QuizGraph',
        phase: 'reduce_llm_failed',
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
        } : String(error),
      }, `LLM reduce failed, falling back to direct selection`);

      // Use topic-based refinement to select from all questions
      const refined = this.refineQuestionSelectionFast(allQuestions, state.questionCount);

      if (refined.length === 0 && retryCount < 1) {
        // Retry if we got nothing
        return new Send('reduce', {
          ...state,
          reduceRetryCount: retryCount + 1,
        } as any);
      }

      return this.finalizeQuestions(refined, state);
    }
  }

  // Helper method to finalize and return questions
  private finalizeQuestions(questions: QuizQuestion[], state: OverallStateType): Partial<OverallStateType> {
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
    }, `Finalizing ${questions.length} questions`);

    logInfo({
      agent: 'QuizGraph',
      phase: 'reduce',
      questionsGenerated: questions.length,
      targetQuestionCount: state.questionCount,
    }, `Generated ${questions.length} questions (target: ${state.questionCount})`);

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
        progress: {
          phase: 'reduce',
          percentage: 100,
          message: `Completed: ${refined.length} quiz questions generated`,
          questionsGenerated: refined.length,
        },
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
      progress: {
        phase: 'reduce',
        percentage: 100,
        message: `Completed: ${questions.length} quiz questions generated`,
        questionsGenerated: questions.length,
      },
    };
  }

  // Helper method to create selection prompt
  private getSelectionPrompt(params: {
    questions: QuizQuestion[];
    targetCount: number;
    difficulty: string;
    focus?: string;
  }): string {
    const { questions, targetCount, difficulty, focus } = params;

    // Create a compact representation of available questions
    const questionsList = questions.map((q, idx) =>
      `Q${idx + 1}: ${q.question.substring(0, 100)}...`
    ).join('\n');

    return `Select exactly ${targetCount} diverse questions from the available pool.

CRITICAL REQUIREMENTS:
- Select EXACTLY ${targetCount} questions - no more, no less
- Select from DIFFERENT topics (max 2 questions per topic)
- Prioritize self-contained questions
- Return the FULL, COMPLETE question objects for your selections

Difficulty: ${difficulty}
${focus ? `Focus: ${focus} (but maintain diversity)` : ''}

AVAILABLE QUESTIONS (${questions.length} total):
${questionsList}

Return the complete selected questions as a JSON array.`;
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
