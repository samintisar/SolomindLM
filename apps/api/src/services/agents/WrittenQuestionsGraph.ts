import { StateGraph, START, END, Send, Annotation } from '@langchain/langgraph';
import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { env } from '../../config/env.js';

// Shared utilities
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
} from './shared/index.js';

// ============================================================
// SCHEMAS
// ============================================================

const WrittenQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  questionType: z.enum(['short', 'essay']),
  rubric: z.object({
    maxPoints: z.number(),
    criteria: z.array(z.string()),
  }),
  // Use .nullable() instead of .optional() for TogetherAI/OpenAI structured output compatibility
  // The LLM will return null when no model answer is provided
  modelAnswer: z.string().nullable(),
});

const WrittenQuestionsArraySchema = z.object({
  questions: z.array(WrittenQuestionSchema),
});

export interface WrittenQuestion {
  id: string;
  question: string;
  questionType: 'short' | 'essay';
  rubric: {
    maxPoints: number;
    criteria: string[];
  };
  modelAnswer: string | null;
}

export interface WrittenQuestionsResponse {
  questions: WrittenQuestion[];
}

// ============================================================
// CONFIGURATION
// ============================================================

const GRAPH_CONFIG = {
  MAP_CHUNK_SIZE: parseInt(env.WRITTEN_QUESTIONS_MAP_CHUNK_SIZE || '80000', 10),
  REDUCE_CHUNK_SIZE: parseInt(env.WRITTEN_QUESTIONS_REDUCE_CHUNK_SIZE || '160000', 10),
  MIN_QUESTIONS_PER_CHUNK: 2,
  MIN_CHUNKS: 2,
  MAP_TIMEOUT_MS: parseInt(env.WRITTEN_QUESTIONS_MAP_TIMEOUT_MS || '180000', 10),
  REDUCE_TIMEOUT_MS: parseInt(env.WRITTEN_QUESTIONS_REDUCE_TIMEOUT_MS || '240000', 10),
  MAX_COLLAPSE_DEPTH: 3,
  DYNAMIC_BUFFER_MULTIPLIER: 1.5,       // Buffer for LLM under-generation
  MAX_QUESTIONS_PER_CHUNK: 10,          // Prevent overloading single chunk
  CHUNK_COVERAGE_THRESHOLD: 0.7,        // Min % of chunks that must succeed
} as const;

// Problematic phrases that indicate questions aren't self-contained
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
    default: () => 10,
  }),
  difficulty: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => 'medium',
  }),
  questionType: Annotation<'short' | 'essay'>({
    reducer: (_x: 'short' | 'essay', y?: 'short' | 'essay') => y ?? _x,
    default: () => 'short',
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
  finalOutput: Annotation<WrittenQuestion[]>({
    reducer: (_x: WrittenQuestion[], y?: WrittenQuestion[]) => y ?? _x,
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

export interface ChunkProcessState {
  chunk: string;
  chunkIndex?: number;
  retryCount?: number;        // Track retry attempts for exponential backoff
  questionCount: number;
  difficulty: string;
  questionType: string;
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
  questionType: string;
  focus?: string;
}): string => {
  const { chunk, questionsPerChunk, difficulty, questionType, focus } = params;

  const difficultyGuidance: Record<string, string> = {
    easy: 'basic recall and definitions - straightforward facts',
    medium: 'concepts and relationships - requires understanding',
    hard: 'application and analysis - requires deeper thinking',
  };

  // Handle mixed vs single types
  const questionTypeSection = `**Question Type: ${questionType.toUpperCase()}**
**Point Value: ${questionType === 'short' ? '5' : '12'}**

${questionType === 'short'
  ? `**SHORT-ANSWER QUESTIONS:**
- A SINGLE, DIRECT QUESTION (not a list of tasks)
- Answerable in 1-3 sentences
- Worth EXACTLY 5 points`
  : `**ESSAY QUESTIONS:**
- Answerable in multiple paragraphs
- Worth 12 points
- Tests analysis, synthesis, and critical thinking`
}`;

  return `You are an expert educator creating HIGH-QUALITY written questions for assessment.

Generate exactly ${questionsPerChunk} questions from this section.

**Difficulty Level: ${difficulty.toUpperCase()}** (${difficultyGuidance[difficulty] || difficulty})
${questionTypeSection}
${focus ? `**Topic Focus:** ${focus}` : ''}

CRITICAL REQUIREMENTS:
- You MUST generate exactly ${questionsPerChunk} questions
- ALL questions MUST be based EXCLUSIVELY on the provided content
- DO NOT use outside knowledge or generate questions about unrelated topics
- Questions MUST BE COMPLETELY SELF-CONTAINED
- Include all necessary context within the question itself

**SELF-CONTAINED QUESTIONS:**
Each question MUST include all necessary context. If referencing a formula, diagram, code snippet, or scenario, include or describe it thoroughly within the question.

Content to base questions on (READ THIS CAREFULLY - ONLY create questions about this content):
${chunk}`;
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Wrapper around shared packChunks utility with WrittenQuestionsGraph logging.
 */
export function packChunks(chunks: string[], targetSize: number = GRAPH_CONFIG.MAP_CHUNK_SIZE): string[] {
  return sharedPackChunks(chunks, {
    targetSize,
    minChunkLength: 50,
    maxChunkLength: 50000,
    agentName: 'WrittenQuestionsGraph',
  });
}

/**
 * Wrapper around shared validateChunks utility with WrittenQuestionsGraph logging.
 */
export function validateChunks(chunks: string[]): string[] {
  return sharedValidateChunks(chunks, {
    targetSize: GRAPH_CONFIG.MAP_CHUNK_SIZE,
    minChunkLength: 50,
    maxChunkLength: 50000,
    agentName: 'WrittenQuestionsGraph',
  });
}

// ============================================================
// MAIN CLASS
// ============================================================

export class WrittenQuestionsGraph {
  private fastLlm: ChatTogetherAI;
  private smartLlm: ChatTogetherAI;

  constructor(apiKey: string, mapModel: string, reduceModel: string) {
    this.fastLlm = new ChatTogetherAI({
      apiKey,
      model: mapModel,
      temperature: 0.3, // Lower temp for factual extraction
      maxTokens: 16000, // Enough for 8-10 questions with rubrics
    });

    this.smartLlm = new ChatTogetherAI({
      apiKey,
      model: reduceModel,
      temperature: 0.3, // Lower temp for consistent selection
      maxTokens: 24000, // Enough for final question selection
    });
  }

  // Node: Split chunks for routing
  splitChunks(state: OverallStateType): Partial<OverallStateType> {
    console.log('\n' + '='.repeat(80));
    console.log('[WrittenQuestionsGraph] ===== SPLIT CHUNKS PHASE =====');
    console.log('='.repeat(80));
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'split_chunks',
      documentCount: state.documentIds?.length || 0,
      chunkCount: state.chunks?.length || 0,
      targetQuestionCount: state.questionCount,
      difficulty: state.difficulty,
      questionType: state.questionType,
      focus: state.focus || 'none',
    }, null, 2));

    // Validate and pack chunks here for efficient routing
    const validatedChunks = validateChunks(state.chunks);
    const packedChunks = packChunks(validatedChunks, GRAPH_CONFIG.MAP_CHUNK_SIZE);

    logInfo({
      agent: 'WrittenQuestionsGraph',
      phase: 'split_chunks',
      originalChunks: state.chunks.length,
      validatedChunks: validatedChunks.length,
      packedChunks: packedChunks.length,
    }, `Packed ${state.chunks.length} chunks into ${packedChunks.length} processed chunks`);

    return {
      ...state,
      chunks: packedChunks, // Update state with packed chunks
      status: 'mapping',
      mapOutputs: state.mapOutputs || [],
      collapsedOutputs: state.collapsedOutputs || [],
      finalOutput: state.finalOutput || [],
      progress: {
        phase: 'split_chunks',
        percentage: 5,
        message: `Prepared ${packedChunks.length} chunks for processing`,
        totalChunks: packedChunks.length,
      },
    };
  }

  // Conditional routing function
  routeToMap(state: OverallStateType): Send[] | 'collapse' {
    console.log('\n' + '='.repeat(80));
    console.log('[WrittenQuestionsGraph] ===== ROUTE TO MAP PHASE =====');
    console.log('='.repeat(80));

    // Chunks are already validated and packed from splitChunks phase
    if (state.chunks.length === 0) {
      console.warn('[WrittenQuestionsGraph] No chunks to process, routing to collapse');
      return 'collapse';
    }

    const chunkCount = state.chunks.length;

    // Dynamic max calculation with buffer
    const questionsPerChunk = Math.max(
      GRAPH_CONFIG.MIN_QUESTIONS_PER_CHUNK,
      Math.min(
        GRAPH_CONFIG.MAX_QUESTIONS_PER_CHUNK,
        Math.ceil(state.questionCount / chunkCount * GRAPH_CONFIG.DYNAMIC_BUFFER_MULTIPLIER)
      )
    );

    // Adjust target if impossible to reach
    let adjustedQuestionCount = state.questionCount;
    const maxPossibleQuestions = chunkCount * questionsPerChunk;

    if (state.questionCount > maxPossibleQuestions) {
      console.warn(`[WrittenQuestionsGraph] Target adjustment: ${state.questionCount} requested, max possible: ${maxPossibleQuestions}`);
      adjustedQuestionCount = maxPossibleQuestions;
    }

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'route_to_map',
      packedChunks: chunkCount,
      targetQuestionCount: state.questionCount,
      adjustedQuestionCount,
      questionsPerChunk,
      maxPossibleQuestions,
      difficulty: state.difficulty,
      questionType: state.questionType,
      focus: state.focus || 'none',
    }, null, 2));

    console.log(`[WrittenQuestionsGraph] Creating ${chunkCount} parallel map tasks (~${questionsPerChunk} questions/chunk)`);

    return state.chunks.map((chunk, idx) => {
      const preview = chunk.substring(0, 100).replace(/\n/g, ' ');
      console.log(`  [Task ${idx + 1}/${chunkCount}] ${preview}... (${chunk.length} chars)`);
      return new Send('map_process', {
        chunk,
        chunkIndex: idx,
        retryCount: 0,
        questionCount: adjustedQuestionCount,
        difficulty: state.difficulty,
        questionType: state.questionType,
        focus: state.focus,
        questionsPerChunk,
      });
    });
  }

  // Node: Map phase (runs in parallel via Send)
  async mapProcess(state: ChunkProcessState): Promise<Partial<OverallStateType>> {
    const { chunk, chunkIndex, questionCount, difficulty, questionType, focus, questionsPerChunk, retryCount = 0 } = state;
    const startTime = Date.now();

    // Exponential backoff with jitter on retries
    if (retryCount > 0) {
      const backoff = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
      const jitter = Math.random() * backoff * 0.1;
      await new Promise(r => setTimeout(r, backoff + jitter));

      logInfo({
        agent: 'WrittenQuestionsGraph',
        phase: 'map_process_retry',
        chunkIndex,
        retryCount,
        backoffMs: backoff + jitter,
      }, `Retry attempt ${retryCount}/2`);
    }

    const chunkId = chunkIndex !== undefined ? `[Chunk ${chunkIndex + 1}]` : '[Chunk ?]';

    logPhaseStart({
      agent: 'WrittenQuestionsGraph',
      phase: 'map_process',
      chunkIndex,
      retryCount,
      chunkLength: chunk.length,
      chunkPreview: chunk.substring(0, 150).replace(/\n/g, ' '),
      targetQuestionCount: questionCount,
      questionsPerChunkTarget: questionsPerChunk,
      difficulty,
      questionType,
      focus: focus || 'none',
    });

    const sanitizedFocus = focus ? sanitizeUserInput(focus) : undefined;
    const prompt = getMapPrompt({ chunk, questionCount, questionsPerChunk, difficulty, questionType, focus: sanitizedFocus });

    logInfo({
      agent: 'WrittenQuestionsGraph',
      phase: 'map_process',
      chunkId,
      promptLength: prompt.length,
    }, `Sending prompt to LLM (${prompt.length} chars)...`);

    let output: string;
    try {
      // Use structured output for reliable parsing
      const structuredLlm = this.fastLlm.withStructuredOutput<WrittenQuestionsResponse>(
        WrittenQuestionsArraySchema,
        { name: 'written_questions' }
      );

      const response: WrittenQuestionsResponse = await invokeWithRetry(
        () => invokeWithTimeout(
          () => structuredLlm.invoke([
            new SystemMessage('You are a professional educator creating written assessment questions.'),
            new HumanMessage(prompt),
          ]),
          GRAPH_CONFIG.MAP_TIMEOUT_MS,
          'WrittenQuestionsMap'
        ),
        {
          maxAttempts: 3,
          baseDelayMs: 1000,
          onRetry: (attempt, error) => {
            logWarn({
              agent: 'WrittenQuestionsGraph',
              phase: 'map_process',
              chunkIndex,
              attempt,
              error: error.message,
            }, `Inner retry attempt ${attempt}/3`);
          }
        },
        'WrittenQuestionsMap'
      );

      // Validate questions are self-contained
      let validQuestions = response.questions.filter(q => this.validateSelfContained(q));

      // Set questionType ourselves based on the parameter (more reliable than asking LLM)
      // Also ensure all questions have valid IDs and correct point values
      const expectedPoints = questionType === 'short' ? 5 : 12;
      validQuestions = validQuestions.map(q => ({
        ...q,
        id: (q.id && q.id.trim()) ? q.id : randomUUID(),
        questionType: questionType as 'short' | 'essay',
        rubric: {
          ...q.rubric,
          maxPoints: expectedPoints,
        },
      }));


      logInfo({
        agent: 'WrittenQuestionsGraph',
        phase: 'map_process_validation',
        chunkIndex,
        generatedCount: response.questions.length,
        validatedCount: validQuestions.length,
        rejectedCount: response.questions.length - validQuestions.length,
      }, `Validated ${validQuestions.length}/${response.questions.length} questions`);

      // Serialize questions as JSON for downstream processing
      output = JSON.stringify(validQuestions);

    } catch (error) {
      // Enhanced error logging with full details
      console.error('\n' + '='.repeat(80));
      console.error('[WrittenQuestionsGraph] ===== MAP PROCESS ERROR =====');
      console.error('='.repeat(80));
      console.error(`Chunk Index: ${chunkIndex}`);
      console.error(`Chunk Length: ${chunk.length} chars`);
      console.error(`Prompt Length: ${prompt.length} chars`);
      console.error(`Difficulty: ${difficulty}`);
      console.error(`Question Type: ${questionType}`);

      if (error instanceof Error) {
        console.error(`Error Name: ${error.name}`);
        console.error(`Error Message: ${error.message}`);
        console.error(`Error Stack:\n${error.stack}`);
        console.error(`Error Cause:`, error.cause);
      } else {
        console.error('Error (non-Error):', String(error));
        console.error('Error details:', error);
      }

      console.error('='.repeat(80));

      const errorContext = {
        agent: 'WrittenQuestionsGraph',
        phase: 'map_process',
        chunkIndex,
        chunkLength: chunk.length,
        difficulty,
        questionType,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack?.split('\n').slice(0, 3).join('\n'),
          cause: error.cause,
        } : String(error),
      };

      logError(errorContext, 'Map process failed - job will retry at job level');

      // Re-throw to trigger job-level retry
      throw error;
    }

    const questionsGenerated = JSON.parse(output).length;
    const elapsed = Date.now() - startTime;

    logPhaseComplete({
      agent: 'WrittenQuestionsGraph',
      phase: 'map_process',
      chunkIndex,
      outputLength: output.length,
      questionsGenerated,
      processingTimeMs: elapsed,
      outputPreview: questionsGenerated > 0
        ? JSON.parse(output).map((q: WrittenQuestion) => q.question.substring(0, 50)).join('; ')
        : '',
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

  // Node: Collapse phase
  async collapse(state: OverallStateType): Promise<Partial<OverallStateType>> {
    console.log(`\n${'='.repeat(80)}`);
    console.log('[WrittenQuestionsGraph] ===== COLLAPSE PHASE =====');
    console.log('='.repeat(80));

    if (!state.mapOutputs || state.mapOutputs.length === 0) {
      logError({
        agent: 'WrittenQuestionsGraph',
        phase: 'collapse',
        error: 'No mapOutputs received',
      }, 'Collapse: ERROR - No mapOutputs received!');
      return {
        ...state,
        collapsedOutputs: [],
        status: 'reducing',
      };
    }

    const totalChunksReceived = state.mapOutputs.length;
    const allQuestions: WrittenQuestion[] = [];
    const failures: Array<{output: string, error: string}> = [];
    const emptyChunks: number[] = [];  // Track which chunks returned empty

    for (let i = 0; i < state.mapOutputs.length; i++) {
      const jsonStr = state.mapOutputs[i];
      try {
        let questions = JSON.parse(jsonStr) as WrittenQuestion[];

        // Ensure all questions have valid IDs and questionType (defensive check)
        const expectedPoints = state.questionType === 'short' ? 5 : 12;
        questions = questions.map(q => ({
          ...q,
          id: (q.id && q.id.trim()) ? q.id : randomUUID(),
          questionType: state.questionType as 'short' | 'essay',
          rubric: {
            ...q.rubric,
            maxPoints: expectedPoints,
          },
        }));

        if (questions.length === 0) {
          emptyChunks.push(i);
        }
        allQuestions.push(...questions);
      } catch (e) {
        const preview = jsonStr.substring(0, 100);
        failures.push({
          output: preview,
          error: e instanceof Error ? e.message : String(e),
        });
        logWarn({
          agent: 'WrittenQuestionsGraph',
          phase: 'collapse_parse_error',
          chunkIndex: i,
          outputPreview: preview,
          error: e instanceof Error ? e.message : String(e),
        }, 'Failed to parse map output JSON, skipping');
      }
    }

    // Check chunk coverage
    const successfulChunks = totalChunksReceived - failures.length - emptyChunks.length;
    const chunkCoverage = successfulChunks / totalChunksReceived;

    logInfo({
      agent: 'WrittenQuestionsGraph',
      phase: 'collapse_coverage',
      totalChunks: totalChunksReceived,
      successfulChunks,
      failedChunks: failures.length,
      emptyChunks: emptyChunks.length,
      chunkCoverage: `${(chunkCoverage * 100).toFixed(1)}%`,
    }, `Chunk coverage: ${successfulChunks}/${totalChunksReceived} (${(chunkCoverage * 100).toFixed(1)}%)`);

    // Warn if coverage is below threshold
    if (chunkCoverage < GRAPH_CONFIG.CHUNK_COVERAGE_THRESHOLD) {
      logWarn({
        agent: 'WrittenQuestionsGraph',
        phase: 'collapse_low_coverage',
        chunkCoverage,
        threshold: GRAPH_CONFIG.CHUNK_COVERAGE_THRESHOLD,
      }, `WARNING: Low chunk coverage (${(chunkCoverage * 100).toFixed(1)}% < ${GRAPH_CONFIG.CHUNK_COVERAGE_THRESHOLD * 100}%)`);
    }

    // Critical error if ALL map outputs failed to parse
    if (allQuestions.length === 0 && state.mapOutputs.length > 0) {
      logError({
        agent: 'WrittenQuestionsGraph',
        phase: 'collapse_critical',
        failures: failures.length,
        emptyChunks: emptyChunks.length,
        failureExamples: failures.slice(0, 3).map(f => f.output),
      }, 'CRITICAL: All map outputs failed to parse or returned empty');

      return {
        ...state,
        collapsedOutputs: [],
        status: 'failed',
      };
    }

    if (failures.length > 0) {
      logWarn({
        agent: 'WrittenQuestionsGraph',
        phase: 'collapse_partial_failure',
        successCount: allQuestions.length,
        failureCount: failures.length,
      }, `${failures.length}/${state.mapOutputs.length} map outputs failed to parse`);
    }

    logInfo({
      agent: 'WrittenQuestionsGraph',
      phase: 'collapse_concatenate',
      totalQuestions: allQuestions.length,
      successfulChunks,
    }, `Concatenated ${successfulChunks} successful chunks into ${allQuestions.length} questions`);

    return {
      ...state,
      collapsedOutputs: [JSON.stringify(allQuestions)],
      status: 'reducing',
      progress: {
        phase: 'collapse',
        percentage: 70,
        message: `Collected ${allQuestions.length} questions from all chunks`,
        questionsGenerated: allQuestions.length,
      },
    };
  }

  // Node: Reduce phase
  async reduce(state: OverallStateType): Promise<Partial<OverallStateType> | Send> {
    // Structured logging start
    logPhaseStart({
      agent: 'WrittenQuestionsGraph',
      phase: 'reduce',
      collapsedOutputsCount: state.collapsedOutputs.length,
      targetQuestionCount: state.questionCount,
      difficulty: state.difficulty,
      questionType: state.questionType,
      focus: state.focus || 'none',
    });

    // Parse questions from collapsed JSON output
    const allQuestions: WrittenQuestion[] = [];
    for (const output of state.collapsedOutputs) {
      try {
        const parsed = JSON.parse(output) as WrittenQuestion[];
        allQuestions.push(...parsed);
      } catch (e) {
        logWarn({
          agent: 'WrittenQuestionsGraph',
          phase: 'reduce_parse_error',
          error: e instanceof Error ? e.message : String(e),
        }, 'Failed to parse question array in reduce');
      }
    }

    const totalQuestionsBefore = allQuestions.length;

    // If we have no questions, fail
    if (totalQuestionsBefore === 0) {
      logError({
        agent: 'WrittenQuestionsGraph',
        phase: 'reduce',
        error: 'No questions generated',
      }, 'CRITICAL: No questions in collapsed outputs!');
      return {
        ...state,
        finalOutput: [],
        status: 'failed',
      };
    }

    // If we have fewer than target, return as-is
    if (totalQuestionsBefore <= state.questionCount) {
      logInfo({
        agent: 'WrittenQuestionsGraph',
        phase: 'reduce_skip',
        totalQuestionsExtracted: totalQuestionsBefore,
        targetQuestionCount: state.questionCount,
        reason: 'Fewer questions than target (LLM would hallucinate)',
      }, `Skipping LLM reduce, using ${totalQuestionsBefore} questions directly`);

      const result = this.finalizeQuestions(allQuestions, state);
      return {
        ...result,
        progress: {
          phase: 'reduce',
          percentage: 100,
          message: `Completed: ${totalQuestionsBefore} questions generated`,
          questionsGenerated: totalQuestionsBefore,
        },
      };
    }

    // Use smart LLM for intelligent selection with structured output
    const retryCount = state.reduceRetryCount ?? 0;

    logInfo({
      agent: 'WrittenQuestionsGraph',
      phase: 'reduce_llm_selection',
      totalQuestionsBefore,
      targetQuestionCount: state.questionCount,
      retryAttempt: retryCount + 1,
      reason: 'Question count outside acceptable range, using LLM for selection',
    }, `Using smart LLM for intelligent question selection from ${totalQuestionsBefore} questions [Attempt ${retryCount + 1}/2]...`);

    try {
      // Use structured output for reliable question selection
      const structuredLlm = this.smartLlm.withStructuredOutput<WrittenQuestionsResponse>(
        WrittenQuestionsArraySchema,
        { name: 'written_questions_selection' }
      );

      // Create a selection prompt
      const selectionPrompt = this.getSelectionPrompt({
        questions: allQuestions,
        targetCount: state.questionCount,
        difficulty: state.difficulty,
        questionType: state.questionType,
        focus: state.focus,
      });

      const response: WrittenQuestionsResponse = await invokeWithRetry(
        () => invokeWithTimeout(
          () => structuredLlm.invoke([
            new SystemMessage('You are an expert educator selecting diverse, high-quality written questions for assessments.'),
            new HumanMessage(selectionPrompt),
          ]),
          GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
          'WrittenQuestionsReduce'
        ),
        {
          maxAttempts: 2,
          baseDelayMs: 1000,
          onRetry: (attempt, error) => {
            logWarn({
              agent: 'WrittenQuestionsGraph',
              phase: 'reduce_llm_retry',
              attempt,
              error: error.message,
            }, `LLM reduce retry attempt ${attempt}/2`);
          }
        },
        'WrittenQuestionsReduce'
      );

      logInfo({
        agent: 'WrittenQuestionsGraph',
        phase: 'reduce_llm_success',
        selectedCount: response.questions.length,
      }, `LLM selection completed, selected ${response.questions.length} questions`);

      if (response.questions.length === 0) {
        throw new Error('LLM returned zero questions');
      }

      const result = this.finalizeQuestions(response.questions, state);
      return {
        ...result,
        progress: {
          phase: 'reduce',
          percentage: 100,
          message: `Completed: ${response.questions.length} questions selected`,
          questionsGenerated: response.questions.length,
        },
      };
    } catch (error) {
      // Retry logic for LLM failures
      const errorContext = {
        agent: 'WrittenQuestionsGraph',
        phase: 'reduce_llm_failed',
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
        } : String(error),
      };

      logError(errorContext, `LLM reduce failed, retrying...`);

      if (retryCount < 1) {
        // Retry with incremented counter
        return new Send('reduce', {
          ...state,
          reduceRetryCount: retryCount + 1,
        } as any);
      }

      // Final fallback: use first N questions
      logError({
        agent: 'WrittenQuestionsGraph',
        phase: 'reduce_final_fallback',
      }, 'LLM reduce failed after retries, using direct selection fallback');

      const fallback = allQuestions.slice(0, state.questionCount);
      const result = this.finalizeQuestions(fallback, state);
      return {
        ...result,
        progress: {
          phase: 'reduce',
          percentage: 100,
          message: `Completed: ${fallback.length} questions (fallback mode)`,
          questionsGenerated: fallback.length,
        },
      };
    }
  }

  // Helper method to finalize and return questions
  private finalizeQuestions(questions: WrittenQuestion[], state: OverallStateType): Partial<OverallStateType> {
    // Ensure IDs are valid and questionType is set correctly from state
    // IMPORTANT: Always set questionType from state, never trust LLM output
    const questionsWithIds = questions.map(q => ({
      ...q,
      id: (q.id && q.id.trim()) ? q.id : randomUUID(),
      questionType: state.questionType as 'short' | 'essay',
    }));

    // Log final questions
    logInfo({
      agent: 'WrittenQuestionsGraph',
      phase: 'reduce_final',
      finalQuestionCount: questionsWithIds.length,
      finalQuestions: questionsWithIds.map((q, idx) => ({
        index: idx + 1,
        id: q.id,
        question: q.question,
        questionType: q.questionType,
        maxPoints: q.rubric.maxPoints,
      })),
    });

    logBanner(
      {
        agent: 'WrittenQuestionsGraph',
        phase: 'generation_complete',
        finalQuestionCount: questionsWithIds.length,
        targetQuestionCount: state.questionCount,
      },
      'GENERATION COMPLETE'
    );

    return {
      ...state,
      finalOutput: questionsWithIds,
      status: 'completed',
    };
  }

  // Helper method to create selection prompt
  private getSelectionPrompt(params: {
    questions: WrittenQuestion[];
    targetCount: number;
    difficulty: string;
    questionType: string;
    focus?: string;
  }): string {
    const { questions, targetCount, difficulty, questionType, focus } = params;

    // Group questions by topic for better LLM selection
    const topicGroups: Record<string, WrittenQuestion[]> = {};
    for (const q of questions) {
      const topic = this.extractTopic(q);
      if (!topicGroups[topic]) topicGroups[topic] = [];
      topicGroups[topic].push(q);
    }

    // Format questions grouped by topic
    const questionsText = Object.entries(topicGroups)
      .map(([topic, qs]) => {
        const qList = qs.map((q, i) =>
          `  [${i + 1}] ${q.question}\n      Type: ${q.questionType} | Points: ${q.rubric.maxPoints}`
        ).join('\n');
        return `**${topic.toUpperCase()}** (${qs.length} questions):\n${qList}`;
      })
      .join('\n\n');

    const questionTypeGuidance = questionType === 'short'
      ? `**SHORT-ANSWER QUESTIONS:**
Must be single, direct questions answerable in 1-3 sentences.
Select questions that are complete and self-contained.`
      : `**ESSAY QUESTIONS:**
Must be substantive questions requiring multi-paragraph answers.
Select questions that test analysis and synthesis.`;

    const pointsInstruction = questionType === 'short' ? '5 points' : '12 points';

    return `You are an expert educator selecting written questions for an assessment.

CRITICAL REQUIREMENTS:
- Select EXACTLY ${targetCount} questions - no more, no less
- Select questions from DIFFERENT topics. Maximum 2 questions per topic
- Your goal is MAXIMUM TOPIC DIVERSITY
- Prioritize self-contained questions with clear rubrics

${questionTypeGuidance}

IMPORTANT: Output questions of type "${questionType}".
POINT VALUES: ${pointsInstruction}

AVAILABLE QUESTIONS (GROUPED BY TOPIC):
${questionsText}

${focus ? `Focus Area: ${focus}` : ''}
Difficulty: ${difficulty}
Question Type: ${questionType}

Return the complete selected questions as a JSON array.`;
  }

  /**
   * Validate that a question is self-contained (doesn't reference external content)
   * Returns true if the question is self-contained, false if it has problematic phrases.
   *
   * Enhanced validation: Check if problematic phrases are accompanied by embedded context.
   * Questions with problematic phrases are accepted if they include context-embedding phrases
   * or are long enough to likely contain the necessary information.
   */
  private validateSelfContained(question: WrittenQuestion): boolean {
    const text = question.question.toLowerCase();

    // Check for problematic phrases that indicate external references
    const foundPhrases = PROBLEMATIC_PHRASES.filter(phrase => text.includes(phrase));
    if (foundPhrases.length === 0) return true;

    // Check if the question includes embedded context
    const hasEmbeddedContext = (
      // Explicit context indicators
      text.includes('as shown in') ||
      text.includes('given that') ||
      text.includes('in the following') ||
      text.includes('consider the') ||
      text.includes('based on') ||
      text.includes('according to') ||
      text.includes('described below') ||
      text.includes('the following') ||
      // Longer questions likely have embedded context
      text.length > 200
    );

    // Reject if has problematic phrases AND no embedded context
    const shouldReject = foundPhrases.length > 0 && !hasEmbeddedContext;

    if (shouldReject) {
      logWarn({
        agent: 'WrittenQuestionsGraph',
        phase: 'validate_self_contained',
        questionPreview: question.question.substring(0, 100),
        questionLength: text.length,
        foundPhrases,
      }, 'Question rejected: references external content without embedded context');
    } else if (foundPhrases.length > 0 && hasEmbeddedContext) {
      logInfo({
        agent: 'WrittenQuestionsGraph',
        phase: 'validate_self_contained_accept',
        questionPreview: question.question.substring(0, 100),
        questionLength: text.length,
        foundPhrases,
      }, 'Question accepted: has problematic phrases but includes embedded context');
    }

    return !shouldReject;
  }

  /**
   * Extract topic from a question for diversity enforcement.
   * Uses regex patterns for more sophisticated topic classification.
   * Pattern from FlashcardGraph.ts:858-872 and QuizGraph.ts:1370-1384.
   */
  private extractTopic(question: WrittenQuestion): string {
    const text = question.question.toLowerCase();

    // Use more sophisticated patterns (prioritize specific over general)
    const patterns: Array<{regex: RegExp; topic: string}> = [
      // Comparison/contrast (highest priority)
      { regex: /\b(compare|contrast|differences?|similarities?|versus|vs\.?|relative to)\b/i, topic: 'Comparisons' },

      // Analysis/evaluation
      { regex: /\b(analyze|analysis|evaluate|assess|critique|examine)\b/i, topic: 'Analysis' },

      // Explanation/description
      { regex: /\b(explain|describe|elaborate|discuss|illustrate|demonstrate)\b/i, topic: 'Explanations' },

      // Process/method
      { regex: /\b(process|method|procedure|step|algorithm|technique|approach)\b/i, topic: 'Processes' },

      // Timeline/dates
      { regex: /\bwhen\b.*\b(year|century|date|time|era|period)\b/i, topic: 'Timeline/Dates' },
      { regex: /\b(in|during|before|after)\s+\d+\b/i, topic: 'Timeline/Dates' },

      // People
      { regex: /\bwho\b.*\b(invented|created|discovered|wrote|authored|developed)\b/i, topic: 'People' },
      { regex: /\b(credited to|attributed to|pioneered by)\b/i, topic: 'People' },

      // Places/location
      { regex: /\bwhere\b.*\b(located|found|discovered|originated)\b/i, topic: 'Places' },

      // Causes/reasons
      { regex: /\b(why|because|reason|cause|lead to|result in|factor)\b/i, topic: 'Causes/Reasons' },

      // Definitions
      { regex: /\b(define|definition|what is|what are|what does|meaning of)\b/i, topic: 'Definitions' },

      // Classification/selection
      { regex: /\b(which|select|choose|identify|classify|categorize)\b/i, topic: 'Classification' },

      // Facts
      { regex: /\b(true|false|correct|incorrect|accurate)\b/i, topic: 'Facts' },
    ];

    // Check patterns in order (most specific first)
    for (const { regex, topic } of patterns) {
      if (regex.test(text)) return topic;
    }

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
