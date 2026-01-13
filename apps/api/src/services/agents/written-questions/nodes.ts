/**
 * Node functions and main class for WrittenQuestionsGraph.
 *
 * Contains all node logic for split_chunks, map_process, collapse,
 * and reduce phases, along with the main WrittenQuestionsGraph class.
 */

import { StateGraph, START, END, Send } from '@langchain/langgraph';
import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { randomUUID } from 'crypto';
import { env } from '../../../config/env.js';

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
  countTokens,
} from '../shared/index.js';

// Import from local modules
import { OverallState, type OverallStateType, type ChunkProcessState, type WrittenQuestion } from './state.js';
import {
  getMapPrompt,
  WrittenQuestionsArraySchema,
  type WrittenQuestionsResponse,
  PROBLEMATIC_PHRASES,
  GRAPH_CONFIG,
} from './prompts.js';

// ============================================================
// CHUNK HELPERS
// ============================================================

/**
 * Wrapper around shared packChunks utility with WrittenQuestionsGraph logging.
 */
export function packChunks(chunks: string[], targetSize: number = GRAPH_CONFIG.MAP_CHUNK_SIZE_TOKENS): string[] {
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
    targetSize: GRAPH_CONFIG.MAP_CHUNK_SIZE_TOKENS,
    minChunkLength: 50,
    maxChunkLength: 50000,
    agentName: 'WrittenQuestionsGraph',
  });
}

// ============================================================
// WRITTEN QUESTIONS GRAPH CLASS
// ============================================================

/**
 * WrittenQuestionsGraph class that orchestrates written question generation.
 * This is the main class that users interact with.
 */
export class WrittenQuestionsGraph {
  private fastLlm: ChatTogetherAI;
  private smartLlm: ChatTogetherAI;

  constructor(apiKey: string, mapModel: string, reduceModel: string) {
    this.fastLlm = new ChatTogetherAI({
      apiKey,
      model: mapModel,
      temperature: 0.3,
      maxTokens: 16000,
    });

    this.smartLlm = new ChatTogetherAI({
      apiKey,
      model: reduceModel,
      temperature: 0.3,
      maxTokens: 24000,
    });
  }

  // Node: Split chunks for routing
  private splitChunks(state: OverallStateType): Partial<OverallStateType> {
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

    const validatedChunks = validateChunks(state.chunks);
    const packedChunks = packChunks(validatedChunks, GRAPH_CONFIG.MAP_CHUNK_SIZE_TOKENS);

    logInfo({
      agent: 'WrittenQuestionsGraph',
      phase: 'split_chunks',
      originalChunks: state.chunks.length,
      validatedChunks: validatedChunks.length,
      packedChunks: packedChunks.length,
    }, `Packed ${state.chunks.length} chunks into ${packedChunks.length} processed chunks`);

    return {
      ...state,
      chunks: packedChunks,
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
  private routeToMap(state: OverallStateType): Send[] | 'collapse' {
    console.log('\n' + '='.repeat(80));
    console.log('[WrittenQuestionsGraph] ===== ROUTE TO MAP PHASE =====');
    console.log('='.repeat(80));

    if (state.chunks.length === 0) {
      console.warn('[WrittenQuestionsGraph] No chunks to process, routing to collapse');
      return 'collapse';
    }

    const chunkCount = state.chunks.length;

    const MAX_QUESTIONS_PER_CHUNK = 25;
    const questionsPerChunk = Math.max(
      GRAPH_CONFIG.MIN_QUESTIONS_PER_CHUNK,
      Math.min(
        MAX_QUESTIONS_PER_CHUNK,
        Math.ceil(state.questionCount / chunkCount * GRAPH_CONFIG.DYNAMIC_BUFFER_MULTIPLIER)
      )
    );

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'route_to_map',
      packedChunks: chunkCount,
      targetQuestionCount: state.questionCount,
      questionsPerChunk,
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
    const { chunk, chunkIndex, questionCount, difficulty, questionType, focus, questionsPerChunk, retryCount = 0 } = state;
    const startTime = Date.now();

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
    let questionsGenerated = 0;

    try {
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

      let validQuestions = response.questions.filter(q => this.validateSelfContained(q));

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

      questionsGenerated = validQuestions.length;
      output = JSON.stringify(validQuestions);

    } catch (error) {
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
      throw error;
    }

    const elapsed = Date.now() - startTime;
    const previewQuestions = questionsGenerated > 0 ? JSON.parse(output) as WrittenQuestion[] : [];

    logPhaseComplete({
      agent: 'WrittenQuestionsGraph',
      phase: 'map_process',
      chunkIndex,
      outputLength: output.length,
      questionsGenerated,
      processingTimeMs: elapsed,
      outputPreview: previewQuestions.map((q: WrittenQuestion) => q.question.substring(0, 50)).join('; '),
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
  private async collapse(state: OverallStateType): Promise<Partial<OverallStateType>> {
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
    const emptyChunks: number[] = [];

    for (let i = 0; i < state.mapOutputs.length; i++) {
      const jsonStr = state.mapOutputs[i];
      try {
        let questions = JSON.parse(jsonStr) as WrittenQuestion[];

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

    if (chunkCoverage < GRAPH_CONFIG.CHUNK_COVERAGE_THRESHOLD) {
      logWarn({
        agent: 'WrittenQuestionsGraph',
        phase: 'collapse_low_coverage',
        chunkCoverage,
        threshold: GRAPH_CONFIG.CHUNK_COVERAGE_THRESHOLD,
      }, `WARNING: Low chunk coverage (${(chunkCoverage * 100).toFixed(1)}% < ${GRAPH_CONFIG.CHUNK_COVERAGE_THRESHOLD * 100}%)`);
    }

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

  // Helper method to create selection prompt
  private getSelectionPrompt(params: {
    questions: WrittenQuestion[];
    targetCount: number;
    difficulty: string;
    questionType: string;
    focus?: string;
  }): string {
    const { questions, targetCount, difficulty, questionType, focus } = params;

    const topicGroups: Record<string, WrittenQuestion[]> = {};
    for (const q of questions) {
      const topic = this.extractTopic(q);
      if (!topicGroups[topic]) topicGroups[topic] = [];
      topicGroups[topic].push(q);
    }

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

    return `You are an expert educator selecting and refining written questions for an assessment.

CRITICAL REQUIREMENTS:
- Select approximately ${targetCount} questions (flexible: ±${Math.ceil(targetCount * 0.2)} is acceptable)
- IDENTIFY AND MERGE similar or duplicate questions before selecting
- Quality over quantity: Better to have ${Math.ceil(targetCount * 0.8)} unique questions than ${targetCount} with duplicates
- Your goal is MAXIMUM SEMANTIC DIVERSITY - each question should test a distinct concept

SIMILARITY DETECTION GUIDELINES:
Questions are considered similar if they:
- Ask about the same concept using different wording (e.g., "What is X?" vs "Define X")
- Test the same comparison/contrast (e.g., "Difference between A and B" vs "Compare A and B")
- Have the same core answer despite surface-level differences
- Cover overlapping content that could be combined

MERGING STRATEGY:
When you find similar questions:
- Combine the best elements from each version
- Create a single, clearer question
- Ensure the merged question is self-contained
- Keep the most comprehensive rubric

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

  // Node: Reduce phase
  private async reduce(state: OverallStateType): Promise<Partial<OverallStateType> | Send> {
    logPhaseStart({
      agent: 'WrittenQuestionsGraph',
      phase: 'reduce',
      collapsedOutputsCount: state.collapsedOutputs.length,
      targetQuestionCount: state.questionCount,
      difficulty: state.difficulty,
      questionType: state.questionType,
      focus: state.focus || 'none',
    });

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

    const retryCount = state.reduceRetryCount ?? 0;

    logInfo({
      agent: 'WrittenQuestionsGraph',
      phase: 'reduce_llm_selection',
      totalQuestionsBefore,
      targetQuestionCount: state.questionCount,
      retryAttempt: retryCount + 1,
      reason: 'Question count outside acceptable range, using LLM for selection',
    }, `Using smart LLM for intelligent question selection from ${totalQuestionsBefore} questions [Attempt ${retryCount + 1}/2]...`);

    const similarQuestions = this.detectSimilarQuestions(allQuestions);

    if (similarQuestions.length > 0) {
      logInfo({
        agent: 'WrittenQuestionsGraph',
        phase: 'reduce_similarity_detection',
        duplicateGroups: similarQuestions.length,
        duplicates: similarQuestions.slice(0, 5).map(d => ({
          type: d.similarity,
          reason: d.reason,
          questions: d.questions.map(q => q.question.substring(0, 80)),
        })),
      }, `Detected ${similarQuestions.length} potential duplicate groups - LLM will handle merging`);
    }

    try {
      const structuredLlm = this.smartLlm.withStructuredOutput<WrittenQuestionsResponse>(
        WrittenQuestionsArraySchema,
        { name: 'written_questions_selection' }
      );

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
          message: `Completed: ${response.questions.length} unique questions (target: ${state.questionCount})`,
          questionsGenerated: response.questions.length,
        },
      };
    } catch (error) {
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
        return new Send('reduce', {
          ...state,
          reduceRetryCount: retryCount + 1,
        } as any);
      }

      logError({
        agent: 'WrittenQuestionsGraph',
        phase: 'reduce_final_fallback',
      }, 'LLM reduce failed after retries, using simple slice fallback');

      const fallback = allQuestions.slice(0, state.questionCount);
      const result = this.finalizeQuestions(fallback, state);
      return {
        ...result,
        progress: {
          phase: 'reduce',
          percentage: 100,
          message: `Completed: ${fallback.length} questions (target: ${state.questionCount}, fallback mode)`,
          questionsGenerated: fallback.length,
        },
      };
    }
  }

  // Helper method to finalize and return questions
  private finalizeQuestions(questions: WrittenQuestion[], state: OverallStateType): Partial<OverallStateType> {
    const questionsWithIds = questions.map(q => ({
      ...q,
      id: (q.id && q.id.trim()) ? q.id : randomUUID(),
      questionType: state.questionType as 'short' | 'essay',
    }));

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

  /**
   * Validate that a question is self-contained (doesn't reference external content)
   */
  private validateSelfContained(question: WrittenQuestion): boolean {
    const text = question.question.toLowerCase();

    const foundPhrases = PROBLEMATIC_PHRASES.filter(phrase => text.includes(phrase));
    if (foundPhrases.length === 0) return true;

    const hasEmbeddedContext = (
      text.includes('as shown in') ||
      text.includes('given that') ||
      text.includes('in the following') ||
      text.includes('consider the') ||
      text.includes('based on') ||
      text.includes('according to') ||
      text.includes('described below') ||
      text.includes('the following') ||
      text.length > 200
    );

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
   */
  private extractTopic(question: WrittenQuestion): string {
    const text = question.question.toLowerCase();

    const patterns: Array<{regex: RegExp; topic: string}> = [
      { regex: /\b(compare|contrast|differences?|similarities?|versus|vs\.?|relative to)\b/i, topic: 'Comparisons' },
      { regex: /\b(analyze|analysis|evaluate|assess|critique|examine)\b/i, topic: 'Analysis' },
      { regex: /\b(explain|describe|elaborate|discuss|illustrate|demonstrate)\b/i, topic: 'Explanations' },
      { regex: /\b(process|method|procedure|step|algorithm|technique|approach)\b/i, topic: 'Processes' },
      { regex: /\bwhen\b.*\b(year|century|date|time|era|period)\b/i, topic: 'Timeline/Dates' },
      { regex: /\b(in|during|before|after)\s+\d+\b/i, topic: 'Timeline/Dates' },
      { regex: /\bwho\b.*\b(invented|created|discovered|wrote|authored|developed)\b/i, topic: 'People' },
      { regex: /\b(credited to|attributed to|pioneered by)\b/i, topic: 'People' },
      { regex: /\bwhere\b.*\b(located|found|discovered|originated)\b/i, topic: 'Places' },
      { regex: /\b(why|because|reason|cause|lead to|result in|factor)\b/i, topic: 'Causes/Reasons' },
      { regex: /\b(define|definition|what is|what are|what does|meaning of)\b/i, topic: 'Definitions' },
      { regex: /\b(which|select|choose|identify|classify|categorize)\b/i, topic: 'Classification' },
      { regex: /\b(true|false|correct|incorrect|accurate)\b/i, topic: 'Facts' },
    ];

    for (const { regex, topic } of patterns) {
      if (regex.test(text)) return topic;
    }

    return 'General';
  }

  /**
   * Detect semantically similar questions using simple heuristics.
   */
  private detectSimilarQuestions(questions: WrittenQuestion[]): Array<{
    similarity: string;
    questions: Array<{index: number; question: string}>;
    reason: string;
  }> {
    const duplicates: Array<{
      similarity: string;
      questions: Array<{index: number; question: string}>;
      reason: string;
    }> = [];

    for (let i = 0; i < questions.length; i++) {
      for (let j = i + 1; j < questions.length; j++) {
        const q1 = questions[i].question.toLowerCase();
        const q2 = questions[j].question.toLowerCase();

        const words1 = new Set(q1.match(/\b\w+\b/g) || []);
        const words2 = new Set(q2.match(/\b\w+\b/g) || []);
        const intersection = [...words1].filter(w => words2.has(w));
        const union = new Set([...words1, ...words2]);
        const overlap = intersection.length / union.size;

        if (overlap > 0.7) {
          duplicates.push({
            similarity: 'high_word_overlap',
            questions: [
              { index: i, question: questions[i].question },
              { index: j, question: questions[j].question },
            ],
            reason: `High word overlap: ${(overlap * 100).toFixed(0)}%`,
          });
        }
      }
    }

    return duplicates;
  }

  /**
   * Build the state graph for written questions generation.
   */
  buildGraph() {
    const builder = new StateGraph(OverallState);

    builder.addNode('split_chunks', (s: OverallStateType) => this.splitChunks(s));
    builder.addNode('map_process', (s: ChunkProcessState) => this.mapProcess(s));
    builder.addNode('collapse', (s: OverallStateType) => this.collapse(s));
    builder.addNode('reduce', (s: OverallStateType) => this.reduce(s));

    builder.addEdge(START, 'split_chunks' as any);

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
