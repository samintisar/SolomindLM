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
  // Questions per chunk bounds
  MIN_QUESTIONS_PER_CHUNK: 3,
  MAX_QUESTIONS_PER_CHUNK: 6,
  // Minimum chunks to process
  MIN_CHUNKS: 3,
  // Timeout settings for LLM calls
  MAP_TIMEOUT_MS: parseInt(env.QUIZ_MAP_TIMEOUT_MS || '180000', 10), // 3 minutes
  REDUCE_TIMEOUT_MS: parseInt(env.QUIZ_REDUCE_TIMEOUT_MS || '240000', 10), // 4 minutes
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

HARD LIMIT: Generate ${questionsPerChunk} questions maximum from this section. NOT more.
This is part of a larger set targeting ${questionCount} total questions across all chunks.

**Difficulty Level: ${difficulty.toUpperCase()}** (${difficultyGuidance[difficulty] || difficulty})
${focus ? `**Topic Focus:** ${focus}` : ''}

CRITICAL REQUIREMENTS:
- Generate exactly 4 options per question (A, B, C, D)
- Distractors (wrong options) must be plausible but clearly incorrect to someone who studied
- Avoid giving away the answer with obvious patterns (e.g., "All of the above")
- Hints must GUIDE thinking without revealing the answer - point to relevant concepts, ask leading questions, or suggest what to consider
- Explanations should clearly explain why the correct answer is right, connecting to key concepts

**Hint Guidelines (IMPORTANT):**
- DO NOT restate the answer in the hint
- DO provide conceptual guidance (e.g., "Consider the chronological order of events" or "Think about the geographical location mentioned")
- DO suggest what information to look for in the question
- DO use phrases like "Refer to...", "Recall that...", "Consider the..."

**Format each question as:**
Q: [your question text]
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

TASK:
1. First, mentally identify 6-10 distinct topics in the content below
2. Then select ${questionCount} questions distributed EVENLY across those topics
3. Example: If you need 20 questions and have 5 topics, select 4 from each topic

Difficulty: ${difficulty}
${focus ? `User preference: ${focus} (but still maintain diversity)` : ''}

AVAILABLE QUESTIONS:
${content}

Select exactly ${questionCount} diverse questions. Return them in the same format.`;
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
  private maxTokens: number;

  constructor(apiKey: string, mapModel: string, reduceModel: string, maxTokens: number = 16000) {
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

    this.maxTokens = maxTokens;
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

    let adjustedQuestionCount = state.questionCount;
    const maxPossibleQuestions = packedChunks.length * GRAPH_CONFIG.MAX_QUESTIONS_PER_CHUNK;

    if (state.questionCount > maxPossibleQuestions) {
      console.warn(`[QuizGraph] Target adjustment: ${state.questionCount} questions requested, max possible: ${maxPossibleQuestions}`);
      adjustedQuestionCount = maxPossibleQuestions;
    }

    const questionsPerChunk = Math.max(
      GRAPH_CONFIG.MIN_QUESTIONS_PER_CHUNK,
      Math.min(GRAPH_CONFIG.MAX_QUESTIONS_PER_CHUNK, Math.ceil(adjustedQuestionCount / packedChunks.length))
    );

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'route_to_map',
      originalChunks: state.chunks.length,
      validatedChunks: validatedChunks.length,
      packedChunks: packedChunks.length,
      originalTarget: state.questionCount,
      adjustedTarget: adjustedQuestionCount,
      questionsPerChunk,
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
      console.error('[QuizGraph] Collapse: ERROR - No mapOutputs received!');
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

    console.log(`[QuizGraph] Total tokens: ${totalTokens}, Reduce chunk size: ${GRAPH_CONFIG.REDUCE_CHUNK_SIZE} chars`);

    const estimatedChars = totalTokens * 4;
    if (estimatedChars <= GRAPH_CONFIG.REDUCE_CHUNK_SIZE) {
      console.log('[QuizGraph] Collapse: skipping recursive collapse, using mapOutputs directly');
      return {
        ...state,
        collapsedOutputs: state.mapOutputs,
        status: 'reducing',
      };
    }

    console.log('[QuizGraph] Collapse: performing recursive collapse');
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

    return this.recursiveCollapse(collapsed);
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
  async reduce(state: OverallStateType): Promise<Partial<OverallStateType>> {
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

    logInfo({
      agent: 'QuizGraph',
      phase: 'reduce_before_parsing',
      combinedLength: combined.length,
      totalQuestionsExtracted: totalQuestionsBefore,
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

  // Fallback parser for quiz questions
  private fallbackParseQuizQuestions(content: string): QuizQuestion[] {
    logInfo({
      agent: 'QuizGraph',
      phase: 'fallback_parse',
      contentLength: content.length,
    }, 'Attempting manual parsing...');

    const questions: QuizQuestion[] = [];

    // Split by Q: markers
    const questionBlocks = content.split(/Q:\s*/).filter(block => block.trim().length > 50);

    for (const block of questionBlocks) {
      try {
        const questionText = block.split(/\n[A]\)|\nA\)/)[0]?.trim() || '';
        if (!questionText) continue;

        // Extract options
        const optionsMatch = block.match(/(?:A\)|A\))\s*([\s\S]+?)(?:\n[B]\)|\nB\))/);
        const optionA = optionsMatch?.[1]?.trim() || '';

        const bMatch = block.match(/(?:B\)|B\))\s*([\s\S]+?)(?:\n[C]\)|\nC\))/);
        const optionB = bMatch?.[1]?.trim() || '';

        const cMatch = block.match(/(?:C\)|C\))\s*([\s\S]+?)(?:\n[D]\)|\nD\))/);
        const optionC = cMatch?.[1]?.trim() || '';

        const dMatch = block.match(/(?:D\)|D\))\s*([\s\S]+?)(?:\nANSWER:|\nANSWER\))/);
        const optionD = dMatch?.[1]?.trim() || '';

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

        if (questionText && optionA && optionB && optionC && optionD) {
          questions.push({
            question: questionText,
            options: [optionA, optionB, optionC, optionD],
            answer: answerIndex,
            hint,
            explanation,
          });
        }
      } catch (e) {
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
    }, `Extracted ${questions.length} questions`);

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
    const maxPerTopic = Math.max(2, Math.ceil(targetCount / topics.length * 2));

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
