import { StateGraph, START, END, Send, Annotation } from '@langchain/langgraph';
import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
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
  modelAnswer: z.string().optional(),
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
  modelAnswer?: string;
}

export interface WrittenQuestionsResponse {
  questions: WrittenQuestion[];
}

// ============================================================
// CONFIGURATION
// ============================================================

const GRAPH_CONFIG = {
  MAP_CHUNK_SIZE: parseInt(env.WRITTEN_QUESTIONS_MAP_CHUNK_SIZE || '30000', 10),
  REDUCE_CHUNK_SIZE: parseInt(env.WRITTEN_QUESTIONS_REDUCE_CHUNK_SIZE || '60000', 10),
  MIN_QUESTIONS_PER_CHUNK: 2,
  MIN_CHUNKS: 2,
  MAP_TIMEOUT_MS: parseInt(env.WRITTEN_QUESTIONS_MAP_TIMEOUT_MS || '180000', 10),
  REDUCE_TIMEOUT_MS: parseInt(env.WRITTEN_QUESTIONS_REDUCE_TIMEOUT_MS || '240000', 10),
  MAX_COLLAPSE_DEPTH: 3,
  TOPIC_ALLOCATION_MULTIPLIER: 2.0,  // Allows topics to exceed proportional share
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
  questionType: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
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
});

export type OverallStateType = typeof OverallState.State;

export interface ChunkProcessState {
  chunk: string;
  chunkIndex?: number;
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
  const { chunk, questionCount, questionsPerChunk, difficulty, questionType, focus } = params;

  const difficultyGuidance: Record<string, string> = {
    easy: 'basic recall and definitions - straightforward facts',
    medium: 'concepts and relationships - requires understanding',
    hard: 'application and analysis - requires deeper thinking',
  };

  const shortSpec = '1-3 sentences, EXACTLY 5 points, tests recall and basic understanding';
  const essaySpec = 'multi-paragraph, 10-15 points, tests analysis and synthesis';

  // Define point instruction based on type
  const pointsInstruction = questionType === 'short'
    ? 'EXACTLY 5 points'
    : questionType === 'essay'
    ? '10-15 points (your choice within this range)'
    : '5 for short, 10-15 for essay';

  return `You are an expert educator creating HIGH-QUALITY written questions for assessment.

REQUIRED OUTPUT: You MUST generate exactly ${questionsPerChunk} questions from this section.
This is part of a larger set targeting ${questionCount} total questions across all chunks.

**Difficulty Level: ${difficulty.toUpperCase()}** (${difficultyGuidance[difficulty] || difficulty})
**Question Type: ${questionType.toUpperCase()}**
**Point Range: ${pointsInstruction}**
${focus ? `**Topic Focus:** ${focus}` : ''}

CRITICAL REQUIREMENTS:
- You MUST output exactly ${questionsPerChunk} questions - no fewer, no more
- ALL questions MUST be based EXCLUSIVELY on the provided content below
- DO NOT use outside knowledge or generate questions about unrelated topics
- Questions MUST BE COMPLETELY SELF-CONTAINED
- Include all necessary context within the question itself
- Questions should require critical thinking, not just recall
- POINT VALUES MUST BE CORRECT: Short = 5 points, Essay = 10-15 points

**CONTENT SOURCING (STRICTLY ENFORCED):**
- ONLY create questions about topics, concepts, and information present in the provided content
- If the content is about [specific topic], ONLY create questions about that topic
- DO NOT create questions about topics not mentioned in the content
- DO NOT fall back to generic questions from your training data

**SHORT-ANSWER QUESTIONS (when questionType is "short"):**
A short-answer question must be:
- A SINGLE, DIRECT QUESTION (not a list of tasks)
- Answerable in 1-3 sentences
- Worth EXACTLY 5 points
- Tests recall and basic understanding

GOOD examples of short-answer questions (follow this STRUCTURE, not topic):
- "What is [concept being discussed in the content]?"
- "Explain the key difference between [concept A] and [concept B] from the lecture."
- "How does [algorithm/method] work according to the content?"

BAD examples (avoid these):
- "1. Define X. 2. Explain Y. 3. Provide an example." (This is a multi-part task, not a single question)
- "Describe the key aspects of..." (too vague for short answer)

**ESSAY QUESTIONS (when questionType is "essay"):**
An essay question must be:
- Answerable in multiple paragraphs
- Worth 10-15 points
- Tests analysis, synthesis, and critical thinking
- May have multiple parts but flows as a coherent question

**SELF-CONTAINED QUESTIONS:**
Each question MUST include all necessary context. If referencing:
- A formula: Include it in the question
- A diagram: Describe it thoroughly
- A code snippet: Include relevant code
- A scenario: Summarize key details

**Format each question EXACTLY as shown below:**

QUESTION 1: [Single, direct question about a specific concept from the content]
TYPE: short
POINTS: 5
RUBRIC: [2-3 specific criteria for grading this question]
MODEL ANSWER: [Concise answer based on the content]

QUESTION 2: [More complex question requiring analysis of content]
TYPE: essay
POINTS: 12
RUBRIC: [2-3 specific criteria for grading this question]
MODEL ANSWER: [Detailed answer based on the content]

Continue for all ${questionsPerChunk} questions...

Content to base questions on (READ THIS CAREFULLY - ONLY create questions about this content):
${chunk}

QUESTIONS:`;
};

const getReducePrompt = (params: {
  content: string;
  questionCount: number;
  difficulty: string;
  questionType: string;
  focus?: string;
}): string => {
  const { content, questionCount, difficulty, questionType, focus } = params;

  // Define point ranges based on question type
  const isShort = questionType === 'short';
  const pointsInstruction = isShort
    ? '5 points exactly'
    : '10-15 points (your choice within this range)';

  const questionTypeGuidance = isShort
    ? `SHORT-ANSWER QUESTIONS:
Must be single, direct questions answerable in 1-3 sentences.
Select questions that are complete and self-contained.
Reject multi-part lists or vague prompts.`
    : `ESSAY QUESTIONS:
Must be substantive questions requiring multi-paragraph answers.
Select questions that test analysis and synthesis.`;

  return `You are selecting written questions for an assessment.

CRITICAL REQUIREMENTS:
Select questions from DIFFERENT topics. Maximum 2 questions per topic.
Your goal is MAXIMUM TOPIC DIVERSITY.

TASK:
1. Identify 6-10 distinct topics
2. Select ${questionCount} questions distributed EVENLY across topics
3. Prioritize self-contained questions with clear rubrics

${questionTypeGuidance}

IMPORTANT: When selecting questions, preserve the original question type. If the target question type is "${questionType}", only output questions of that type.

POINT VALUES - STRICTLY ENFORCED:
- Short answer questions: EXACTLY 5 points (no more, no less)
- Essay questions: 10-15 points (choose a value within this range)

OUTPUT FORMAT - EXACTLY AS SHOWN BELOW:
QUESTION 1: [question text - COMPLETE AND SELF-CONTAINED]
TYPE: ${questionType}
POINTS: ${isShort ? 5 : 12}
RUBRIC: [2-3 specific criteria for grading]
MODEL ANSWER: [reference answer for grading purposes]

QUESTION 2: [next question]
TYPE: ${questionType}
POINTS: ${isShort ? 5 : 12}
RUBRIC: [2-3 specific criteria for grading]
MODEL ANSWER: [reference answer]

Continue for all ${questionCount} questions...

Difficulty: ${difficulty}
Question Type: ${questionType} (ALL output questions MUST be this type)
Point Range: ${pointsInstruction}
${focus ? `Focus: ${focus}` : ''}

AVAILABLE QUESTIONS:
${content}`;
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
    });

    this.smartLlm = new ChatTogetherAI({
      apiKey,
      model: reduceModel,
      temperature: 0.3, // Lower temp for consistent selection
    });
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
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
    console.log('[WrittenQuestionsGraph] ===== ROUTE TO MAP PHASE =====');
    console.log('='.repeat(80));

    if (state.chunks.length === 0) {
      console.warn('[WrittenQuestionsGraph] No chunks to process, routing to collapse');
      return 'collapse';
    }

    const validatedChunks = validateChunks(state.chunks);
    const packedChunks = packChunks(validatedChunks, GRAPH_CONFIG.MAP_CHUNK_SIZE);

    const questionsPerChunk = Math.max(
      GRAPH_CONFIG.MIN_QUESTIONS_PER_CHUNK,
      Math.ceil(state.questionCount / packedChunks.length)
    );

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'route_to_map',
      originalChunks: state.chunks.length,
      validatedChunks: validatedChunks.length,
      packedChunks: packedChunks.length,
      targetQuestionCount: state.questionCount,
      questionsPerChunk,
      difficulty: state.difficulty,
      questionType: state.questionType,
      focus: state.focus || 'none',
    }, null, 2));

    console.log(`[WrittenQuestionsGraph] Creating ${packedChunks.length} parallel map tasks (~${questionsPerChunk} questions/chunk)`);

    return packedChunks.map((chunk, idx) => {
      const preview = chunk.substring(0, 100).replace(/\n/g, ' ');
      console.log(`  [Task ${idx + 1}/${packedChunks.length}] ${preview}... (${chunk.length} chars)`);
      return new Send('map_process', {
        chunk,
        chunkIndex: idx,
        questionCount: state.questionCount,
        difficulty: state.difficulty,
        questionType: state.questionType,
        focus: state.focus,
        questionsPerChunk,
      });
    });
  }

  // Node: Map phase (runs in parallel via Send)
  async mapProcess(state: ChunkProcessState): Promise<Partial<OverallStateType>> {
    const { chunk, chunkIndex, questionCount, difficulty, questionType, focus, questionsPerChunk } = state;
    const startTime = Date.now();

    const chunkId = chunkIndex !== undefined ? `[Chunk ${chunkIndex + 1}]` : '[Chunk ?]';

    logPhaseStart({
      agent: 'WrittenQuestionsGraph',
      phase: 'map_process',
      chunkIndex,
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
      const response = await invokeWithRetry(
        () => invokeWithTimeout(
          () => this.fastLlm.invoke([
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
            }, `Retry attempt ${attempt}/3`);
          }
        },
        'WrittenQuestionsMap'
      );

      output = response.content.toString();
    } catch (error) {
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
        } : String(error),
      };

      logError(errorContext, 'Map process failed');

      output = `- Main Topics: Error processing chunk
- Error: ${error instanceof Error ? error.message : 'Unknown error'}
- Chunk Info: ${chunk.length} chars, difficulty: ${difficulty}

[Fallback: This chunk could not be processed due to timeout or error. The written questions generation will continue with other chunks.]`;
    }

    const questionsGenerated = output.split(/QUESTION \d+:/i).length - 1;
    const elapsed = Date.now() - startTime;

    logPhaseComplete({
      agent: 'WrittenQuestionsGraph',
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

  // Node: Collapse phase
  async collapse(state: OverallStateType): Promise<Partial<OverallStateType>> {
    console.log(`\n${'='.repeat(80)}`);
    console.log('[WrittenQuestionsGraph] ===== COLLAPSE PHASE =====');
    console.log('='.repeat(80));

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'collapse',
      mapOutputsReceived: state.mapOutputs.length,
      mapOutputsDetails: state.mapOutputs.map((output, idx) => ({
        index: idx,
        length: output.length,
        questions: output.split(/QUESTION \d+:/i).length - 1,
        preview: output.substring(0, 100).replace(/\n/g, ' '),
      })),
    }, null, 2));

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

    const totalTokens = state.mapOutputs.reduce(
      (sum, s) => sum + this.estimateTokens(s),
      0
    );

    logInfo({
      agent: 'WrittenQuestionsGraph',
      phase: 'collapse',
      totalTokens,
      reduceChunkSize: GRAPH_CONFIG.REDUCE_CHUNK_SIZE,
    }, `Total tokens: ${totalTokens}, Reduce chunk size: ${GRAPH_CONFIG.REDUCE_CHUNK_SIZE} chars`);

    const estimatedChars = totalTokens * 4;
    if (estimatedChars <= GRAPH_CONFIG.REDUCE_CHUNK_SIZE) {
      logInfo({
        agent: 'WrittenQuestionsGraph',
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
      agent: 'WrittenQuestionsGraph',
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
        agent: 'WrittenQuestionsGraph',
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
    const prompt = `Condense these written questions into a consolidated set while retaining all unique and high-quality questions. Keep the exact same format:\n\n${combined}\n\nCONDENSED QUESTIONS:`;

    const response = await invokeWithRetry(
      () => invokeWithTimeout(
        () => this.smartLlm.invoke([
          new SystemMessage('You are a skilled content consolidator.'),
          new HumanMessage(prompt),
        ]),
        GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
        'WrittenQuestionsCollapseGroup'
      ),
      {
        maxAttempts: 2,
        baseDelayMs: 1000,
        onRetry: (attempt, error) => {
          logWarn({
            agent: 'WrittenQuestionsGraph',
            phase: 'collapse_group_retry',
            attempt,
            error: error.message,
          }, `Collapse group retry attempt ${attempt}/2`);
        }
      },
      'WrittenQuestionsCollapseGroup'
    );

    return response.content.toString();
  }

  // Node: Reduce phase
  async reduce(state: OverallStateType): Promise<Partial<OverallStateType> | Send> {
    logPhaseStart({
      agent: 'WrittenQuestionsGraph',
      phase: 'reduce',
      collapsedOutputsCount: state.collapsedOutputs.length,
      targetQuestionCount: state.questionCount,
      difficulty: state.difficulty,
      questionType: state.questionType,
      focus: state.focus || 'none',
    });

    const combined = state.collapsedOutputs.join('\n\n---\n\n');
    const totalQuestionsBefore = combined.split(/QUESTION \d+:/i).length - 1;

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
        agent: 'WrittenQuestionsGraph',
        phase: 'reduce_skip_llm',
        combinedLength: combined.length,
        totalQuestionsExtracted: totalQuestionsBefore,
        targetQuestionCount: state.questionCount,
        reason: skipReason,
      }, `Skipping LLM reduce, parsing ${totalQuestionsBefore} questions directly from map outputs...`);

      const questions = this.parseWrittenQuestions(combined);

      logInfo({
        agent: 'WrittenQuestionsGraph',
        phase: 'reduce',
        questionsGenerated: questions.length,
        targetQuestionCount: state.questionCount,
      }, `Generated ${questions.length} questions (target: ${state.questionCount})`);

      if (questions.length === 0) {
        logError({
          agent: 'WrittenQuestionsGraph',
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

      // Trim or pad to target count using topic-based sampling for diversity
      const finalQuestions = questions.length > state.questionCount
        ? this.refineQuestionSelectionFast(questions, state.questionCount)
        : questions;

      // Log final questions
      logInfo({
        agent: 'WrittenQuestionsGraph',
        phase: 'reduce_final',
        finalQuestionCount: finalQuestions.length,
        finalQuestions: finalQuestions.map((q, idx) => ({
          index: idx + 1,
          question: q.question,
          questionType: q.questionType,
          maxPoints: q.rubric.maxPoints,
        })),
      });

      logBanner(
        {
          agent: 'WrittenQuestionsGraph',
          phase: 'generation_complete',
          finalQuestionCount: finalQuestions.length,
          targetQuestionCount: state.questionCount,
        },
        'GENERATION COMPLETE'
      );

      return {
        ...state,
        finalOutput: finalQuestions,
        status: 'completed',
      };
    }

    // Use smart LLM for intelligent selection
    const retryCount = state.reduceRetryCount ?? 0;

    logInfo({
      agent: 'WrittenQuestionsGraph',
      phase: 'reduce_llm_selection',
      totalQuestionsBefore,
      targetQuestionCount: state.questionCount,
      retryAttempt: retryCount + 1,
      reason: 'Question count outside acceptable range, using LLM for selection',
    }, `Using smart LLM for intelligent question selection from ${totalQuestionsBefore} questions [Attempt ${retryCount + 1}/2]...`);

    const sanitizedFocus = state.focus ? sanitizeUserInput(state.focus) : undefined;
    const prompt = getReducePrompt({
      content: combined,
      questionCount: state.questionCount,
      difficulty: state.difficulty,
      questionType: state.questionType,
      focus: sanitizedFocus,
    });

    let llmOutput: string;
    try {
      const response = await invokeWithRetry(
        () => invokeWithTimeout(
          () => this.smartLlm.invoke([
            new SystemMessage('You are a question curator selecting diverse, high-quality written questions.'),
            new HumanMessage(prompt),
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

      llmOutput = response.content.toString();

      logInfo({
        agent: 'WrittenQuestionsGraph',
        phase: 'reduce_llm_success',
        outputLength: llmOutput.length,
      }, `LLM selection completed, output: ${llmOutput.length} chars`);
    } catch (error) {
      // Fallback to parsing all questions if LLM fails
      logError({
        agent: 'WrittenQuestionsGraph',
        phase: 'reduce_llm_failed',
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
        } : String(error),
      }, `LLM reduce failed, falling back to direct parsing`);

      llmOutput = combined;
    }

    const questions = this.parseWrittenQuestions(llmOutput);

    logInfo({
      agent: 'WrittenQuestionsGraph',
      phase: 'reduce',
      questionsGenerated: questions.length,
      targetQuestionCount: state.questionCount,
    }, `Generated ${questions.length} questions (target: ${state.questionCount})`);

    if (questions.length === 0) {
      // Retry with stricter prompt if we haven't exceeded max retries
      const MAX_REDUCE_RETRIES = 1; // Allow 1 retry (total 2 attempts)
      if (retryCount < MAX_REDUCE_RETRIES) {
        logWarn({
          agent: 'WrittenQuestionsGraph',
          phase: 'reduce',
          error: 'No questions parsed from LLM output',
          totalQuestionsBefore,
          currentAttempt: retryCount + 1,
        }, `LLM output produced 0 parsable questions. Retrying...`);

        // Return a Send to re-route to reduce with incremented retry count
        return new Send('reduce', {
          ...state,
          reduceRetryCount: retryCount + 1,
        } as any);
      }

      // Final failure after all retries exhausted
      logError({
        agent: 'WrittenQuestionsGraph',
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

    // Trim or pad to target count using topic-based sampling for diversity
    const finalQuestions = questions.length > state.questionCount
      ? this.refineQuestionSelectionFast(questions, state.questionCount)
      : questions;

    // Log final questions
    logInfo({
      agent: 'WrittenQuestionsGraph',
      phase: 'reduce_final',
      finalQuestionCount: finalQuestions.length,
      finalQuestions: finalQuestions.map((q, idx) => ({
        index: idx + 1,
        question: q.question,
        questionType: q.questionType,
        maxPoints: q.rubric.maxPoints,
      })),
    });

    logBanner(
      {
        agent: 'WrittenQuestionsGraph',
        phase: 'generation_complete',
        finalQuestionCount: finalQuestions.length,
        targetQuestionCount: state.questionCount,
      },
      'GENERATION COMPLETE'
    );

    return {
      ...state,
      finalOutput: finalQuestions,
      status: 'completed',
    };
  }

  /**
   * Validate that a question is self-contained (doesn't reference external content)
   * Returns true if the question is self-contained, false if it has problematic phrases.
   *
   * Smart validation: Only reject questions that are BOTH short (<150 chars) AND have problematic phrases.
   * Longer questions likely include the necessary context embedded.
   */
  private validateSelfContained(question: WrittenQuestion): boolean {
    const text = question.question.toLowerCase();
    const hasProblematicPhrase = PROBLEMATIC_PHRASES.some(phrase => text.includes(phrase));
    const isShort = text.length < 150;

    // Only reject if both short AND has problematic phrases
    // (longer questions likely have context embedded despite the phrases)
    const shouldReject = hasProblematicPhrase && isShort;

    if (shouldReject) {
      logWarn({
        agent: 'WrittenQuestionsGraph',
        phase: 'validate_self_contained',
        questionPreview: question.question.substring(0, 100),
        questionLength: text.length,
        foundPhrases: PROBLEMATIC_PHRASES.filter(phrase => text.includes(phrase)),
      }, 'Question rejected: short with potential external references');
    } else if (hasProblematicPhrase && !isShort) {
      logInfo({
        agent: 'WrittenQuestionsGraph',
        phase: 'validate_self_contained_accept',
        questionPreview: question.question.substring(0, 100),
        questionLength: text.length,
        foundPhrases: PROBLEMATIC_PHRASES.filter(phrase => text.includes(phrase)),
      }, 'Question accepted: has phrases but is long enough to include context');
    }

    return !shouldReject;
  }

  /**
   * Extract topic from a question for diversity enforcement.
   * Pattern from FlashcardGraph.ts:858-872 and QuizGraph.ts:1370-1384.
   */
  private extractTopic(question: WrittenQuestion): string {
    const text = question.question.toLowerCase();

    // Simple keyword-based topic extraction (consistent with FlashcardGraph/QuizGraph)
    if (text.includes('what is') || text.includes('define') || text.includes('definition')) return 'Definitions';
    if (text.includes('when') || text.includes('year') || text.includes('century') || text.includes('date')) return 'Timeline/Dates';
    if (text.includes('who') || text.includes('person') || text.includes('people')) return 'People';
    if (text.includes('where') || text.includes('place') || text.includes('location')) return 'Places';
    if (text.includes('why') || text.includes('because') || text.includes('reason') || text.includes('cause')) return 'Causes/Reasons';
    if (text.includes('how') || text.includes('process') || text.includes('method') || text.includes('step')) return 'Processes';
    if (text.includes('which') || text.includes('select') || text.includes('choose') || text.includes('identify')) return 'Classification';
    if (text.includes('true') || text.includes('false') || text.includes('correct')) return 'Facts';
    if (text.includes('compare') || text.includes('difference') || text.includes('contrast') || text.includes('versus')) return 'Comparisons';
    if (text.includes('explain') || text.includes('describe') || text.includes('discuss')) return 'Explanations';
    if (text.includes('analyze') || text.includes('analysis') || text.includes('evaluate')) return 'Analysis';

    return 'General';
  }

  /**
   * Helper method to group questions by topic for debugging.
   * Pattern from FlashcardGraph.ts:875-892.
   */
  private groupQuestionsByTopic(questions: WrittenQuestion[]): Record<string, number> {
    const topics: Record<string, number> = {};

    for (const q of questions) {
      const topic = this.extractTopic(q);
      topics[topic] = (topics[topic] || 0) + 1;
    }

    return topics;
  }

  /**
   * Fast refinement: topic-based sampling to ensure diverse question selection.
   * Pattern from FlashcardGraph.ts:761-855 and QuizGraph.ts:1295-1368.
   */
  private refineQuestionSelectionFast(questions: WrittenQuestion[], targetCount: number): WrittenQuestion[] {
    logInfo({
      agent: 'WrittenQuestionsGraph',
      phase: 'refine_fast',
      totalQuestions: questions.length,
      targetCount,
    }, `Selecting ${targetCount} questions from ${questions.length} using topic-based sampling`);

    // Group questions by topic
    const topicGroups: Record<string, WrittenQuestion[]> = {};
    for (const q of questions) {
      const topic = this.extractTopic(q);
      if (!topicGroups[topic]) topicGroups[topic] = [];
      topicGroups[topic].push(q);
    }

    const topics = Object.keys(topicGroups);
    logInfo({
      agent: 'WrittenQuestionsGraph',
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
    const selected: WrittenQuestion[] = [];
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
      agent: 'WrittenQuestionsGraph',
      phase: 'refine_fast_selected',
      selectedCount: finalSelected.length,
      allocations,
    }, `Selected ${finalSelected.length} questions`);

    // Log distribution
    const finalDistribution = this.groupQuestionsByTopic(finalSelected);
    logInfo({
      agent: 'WrittenQuestionsGraph',
      phase: 'refine_fast_distribution',
      finalDistribution,
    });

    return finalSelected;
  }

  // Parse written questions from LLM output
  private parseWrittenQuestions(content: string): WrittenQuestion[] {
    logInfo({
      agent: 'WrittenQuestionsGraph',
      phase: 'parse_written_questions',
      contentLength: content.length,
    }, 'Attempting manual parsing...');

    const questions: WrittenQuestion[] = [];
    let failedParseCount = 0;
    let failedValidationCount = 0;

    // More flexible pattern to match QUESTION markers
    // Handles: "QUESTION 1:", "**QUESTION 1:**", "Question 1:", "**QUESTION 1**", etc.
    const questionPattern = /(?:^|\n)\s*[\*\_]*QUESTION\s+\d+[\*\_:]*\s*/i;
    const allBlocks = content.split(questionPattern);

    // Filter blocks: must be >30 chars AND contain at least one required marker (TYPE, POINTS, or RUBRIC)
    // This prevents introductory text like "Here are 5 questions:" from being parsed as a question
    const questionBlocks = allBlocks.filter(block => {
      const trimmed = block.trim();
      const hasRequiredMarker = /TYPE:|POINTS?:|RUBRIC:/i.test(trimmed);
      return trimmed.length > 30 && hasRequiredMarker;
    });

    logInfo({
      agent: 'WrittenQuestionsGraph',
      phase: 'parse_split',
      totalBlocksFound: questionBlocks.length,
      contentPreview: content.substring(0, 500).replace(/\n/g, ' '),
    }, `Split content into ${questionBlocks.length} blocks`);

    for (let i = 0; i < questionBlocks.length; i++) {
      const block = questionBlocks[i];
      try {
        // Extract TYPE first (needed to determine defaults)
        const typeMatch = block.match(/TYPE:\s*(short|essay|mixed)/i);
        const questionType = (typeMatch?.[1]?.toLowerCase() === 'essay' ? 'essay' : 'short') as 'short' | 'essay';

        // Extract POINTS (also try "POINT:" or "MAX POINTS:")
        const pointsMatch = block.match(/POINTS?:\s*(\d+)/i);
        let maxPoints = parseInt(pointsMatch?.[1] || questionType === 'essay' ? '15' : '5', 10);

        // Enforce correct point ranges based on question type
        // Short answer: max 5 points
        // Essay: 10-15 points
        if (questionType === 'short') {
          if (maxPoints > 5) {
            logWarn({
              agent: 'WrittenQuestionsGraph',
              phase: 'parse_points_correction',
              blockIndex: i,
              originalPoints: maxPoints,
              correctedPoints: 5,
              questionType,
            }, `Short question had ${maxPoints} points, corrected to 5`);
            maxPoints = 5;
          }
        } else if (questionType === 'essay') {
          if (maxPoints < 10) {
            logWarn({
              agent: 'WrittenQuestionsGraph',
              phase: 'parse_points_correction',
              blockIndex: i,
              originalPoints: maxPoints,
              correctedPoints: 10,
              questionType,
            }, `Essay question had ${maxPoints} points, corrected to 10`);
            maxPoints = 10;
          } else if (maxPoints > 15) {
            logWarn({
              agent: 'WrittenQuestionsGraph',
              phase: 'parse_points_correction',
              blockIndex: i,
              originalPoints: maxPoints,
              correctedPoints: 15,
              questionType,
            }, `Essay question had ${maxPoints} points, corrected to 15`);
            maxPoints = 15;
          }
        }

        // Extract RUBRIC
        const rubricMatch = block.match(/RUBRIC:\s*([\s\S]+?)(?=MODEL ANSWER:|POINTS?:|$)/i);
        const rubricText = rubricMatch?.[1]?.trim() || 'Accuracy, completeness, clarity';
        const criteria = rubricText.split(/,|\d[\.\)]/).map(c => c.trim().replace(/^[\d\.\)]+\s*/, '')).filter(c => c.length > 2);

        // Extract MODEL ANSWER
        const modelMatch = block.match(/MODEL ANSWER:\s*([\s\S]+?)(?=(?:\n\s*[\*\_]*QUESTION\s+\d+|$))/i);
        const modelAnswer = modelMatch?.[1]?.trim();

        // Try multiple strategies to extract question text
        let questionText = '';

        // Strategy 1: Question text is before TYPE (standard format)
        const beforeType = block.split(/TYPE:/i)[0]?.trim() || '';
        const cleanedBeforeType = beforeType
          .replace(/^[\*\_]*(Question|Q)?\d*[\*\_:]*\s*/i, '')
          .replace(/^[\*\_]*QUESTION\s+\d+[\*\_:]*\s*/i, '')
          .trim();

        // Strategy 2: Question text is after RUBRIC (some LLMs format this way)
        const afterRubric = block.split(/RUBRIC:/i)[1]?.split(/MODEL ANSWER:/i)[0]?.trim() || '';
        const cleanedAfterRubric = afterRubric
          .replace(/^[\*\_]*(Question|Q)?\d*[\*\_:]*\s*/i, '')
          .replace(/^[\*\_]*QUESTION\s+\d+[\*\_:]*\s*/i, '')
          .trim();

        // Strategy 3: Extract text between QUESTION header and TYPE (more lenient)
        const lenientMatch = block.match(/^[\s\S]*?(?=TYPE:)/i);
        const cleanedLenient = lenientMatch?.[0]
          ?.replace(/^[\*\_]*(Question|Q)?\d*[\*\_:]*\s*/i, '')
          .replace(/^[\*\_]*QUESTION\s+\d+[\*\_:]*\s*/i, '')
          .trim() || '';

        // Pick the best strategy
        if (cleanedBeforeType.length >= 10) {
          questionText = cleanedBeforeType;
        } else if (cleanedLenient.length >= 10) {
          questionText = cleanedLenient;
        } else if (cleanedAfterRubric.length >= 10) {
          questionText = cleanedAfterRubric;
        } else {
          // Last resort: try to find any meaningful text before TYPE/POINTS/RUBRIC
          const anyTextMatch = block.match(/^([\s\S]{20,}?)(?=TYPE:|POINTS?:|RUBRIC:)/i);
          questionText = anyTextMatch?.[1]?.trim().replace(/^[\*\_]*(Question|Q)?\d*[\*\_:]*\s*/i, '').trim() || '';
        }

        // Additional cleaning: remove common prefixes and suffixes
        questionText = questionText
          .replace(/^[\*\_]*|[\*\_]*$/g, '') // Remove surrounding markdown
          .replace(/^(Question|Q)\s*\d*:\s*/i, '') // Remove "Question 1:" prefix
          .replace(/^\*\*|\*\*$/g, '') // Remove bold markdown
          .trim();

        if (!questionText || questionText.length < 10) {
          logWarn({
            agent: 'WrittenQuestionsGraph',
            phase: 'parse_skip',
            blockIndex: i,
            reason: 'Question text too short or empty after all extraction strategies',
            questionTextLength: questionText.length,
            blockPreview: block.substring(0, 150).replace(/\n/g, ' '),
          }, `Skipping block ${i + 1}`);
          failedParseCount++;
          continue;
        }

        const question: WrittenQuestion = {
          id: `q_${crypto.randomUUID().slice(0, 8)}`,
          question: questionText,
          questionType,
          rubric: {
            maxPoints,
            criteria: criteria.length > 0 ? criteria : ['Accuracy', 'Completeness', 'Clarity'],
          },
          modelAnswer,
        };

        // Validate that question is self-contained
        if (!this.validateSelfContained(question)) {
          failedValidationCount++;
          logWarn({
            agent: 'WrittenQuestionsGraph',
            phase: 'parse_validation_failed',
            questionPreview: questionText.substring(0, 50),
          }, 'Question failed self-contained validation');
          continue; // Skip questions that aren't self-contained
        }

        questions.push(question);
        logInfo({
          agent: 'WrittenQuestionsGraph',
          phase: 'parse_success',
          blockIndex: i,
          questionPreview: questionText.substring(0, 50),
          questionType,
          maxPoints,
        }, `Parsed question ${questions.length}`);
      } catch (e) {
        failedParseCount++;
        logWarn({
          agent: 'WrittenQuestionsGraph',
          phase: 'parse_error',
          blockIndex: i,
          error: e instanceof Error ? e.message : String(e),
          blockPreview: block.substring(0, 200).replace(/\n/g, ' '),
        }, 'Failed to parse question block');
      }
    }

    logInfo({
      agent: 'WrittenQuestionsGraph',
      phase: 'parse_complete',
      extractedCount: questions.length,
      failedParseCount,
      failedValidationCount,
      totalBlocks: questionBlocks.length,
    }, `Extracted ${questions.length} questions (${failedParseCount} failed to parse, ${failedValidationCount} failed validation)`);

    return questions;
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
