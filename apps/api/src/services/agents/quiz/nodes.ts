/**
 * Node functions and main class for QuizGraph.
 *
 * Contains all node logic for split_chunks, map_process, collapse,
 * and reduce phases, along with the main QuizGraph class.
 */

import { StateGraph, START, END, Send } from '@langchain/langgraph';
import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';

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
  validateQuiz,
  countTokens,
  clearStateKeys,
} from '../shared/index.js';

// Import from local modules
import { OverallState, type OverallStateType, type ChunkProcessState, type QuizQuestion } from './state.js';
import {
  getMapPrompt,
  getSelectionPrompt,
  QuizQuestionArraySchema,
  type QuizQuestionResponse,
  GRAPH_CONFIG,
} from './prompts.js';

// ============================================================
// STRUCTURED OUTPUT SCHEMAS
// ============================================================

/**
 * Interface for the structured LLM to avoid deep type instantiation.
 * Follows the pattern from FlashcardGraph.
 */
interface QuizQuestionOutputInvoker {
  invoke(messages: Array<SystemMessage | HumanMessage>): Promise<QuizQuestionResponse>;
}

/**
 * Helper function to create a structured LLM without triggering deep type instantiation.
 */
function createStructuredLLM(llm: ChatTogetherAI, schema: z.ZodTypeAny): QuizQuestionOutputInvoker {
  // @ts-ignore - Type instantiation is excessively deep with LangChain's withStructuredOutput
  return llm.withStructuredOutput(schema, {
    name: 'quiz_questions'
  }) as any;
}

// ============================================================
// CHUNK HELPERS
// ============================================================

/**
 * Wrapper around shared packChunks utility with QuizGraph logging.
 */
export function packChunks(chunks: string[], targetSize: number = GRAPH_CONFIG.MAP_CHUNK_SIZE_TOKENS): string[] {
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
    targetSize: GRAPH_CONFIG.MAP_CHUNK_SIZE_TOKENS,
    minChunkLength: 50,
    maxChunkLength: 50000,
    agentName: 'QuizGraph',
  });
}

// ============================================================
// QUIZ GRAPH CLASS
// ============================================================

/**
 * QuizGraph class that orchestrates quiz question generation.
 * This is the main class that users interact with.
 */
export class QuizGraph {
  private fastLlm: ChatTogetherAI;
  private smartLlm: ChatTogetherAI;
  private fastLlmStructured: QuizQuestionOutputInvoker;

  constructor(apiKey: string, mapModel: string, reduceModel: string) {
    this.fastLlm = new ChatTogetherAI({
      apiKey,
      model: mapModel,
      temperature: 0.4,
      maxTokens: 16000,
    });

    this.smartLlm = new ChatTogetherAI({
      apiKey,
      model: reduceModel,
      temperature: 0.3,
      maxTokens: GRAPH_CONFIG.REDUCE_MAX_TOKENS,
    });

    // Create structured LLM instance
    this.fastLlmStructured = createStructuredLLM(this.fastLlm, QuizQuestionArraySchema);
  }

  private estimateTokens(text: string): number {
    // Use accurate token counting via tiktoken
    return countTokens(text);
  }

  // Node: Split chunks for routing
  private splitChunks(state: OverallStateType): Partial<OverallStateType> {
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
  private routeToMap(state: OverallStateType): Send[] | 'collapse' {
    console.log('\n' + '='.repeat(80));
    console.log('[QuizGraph] ===== ROUTE TO MAP PHASE =====');
    console.log('='.repeat(80));

    if (state.chunks.length === 0) {
      console.warn('[QuizGraph] No chunks to process, routing to collapse');
      return 'collapse';
    }

    const validatedChunks = validateChunks(state.chunks);
    const packedChunks = packChunks(validatedChunks, GRAPH_CONFIG.MAP_CHUNK_SIZE_TOKENS);

    const MIN_QUESTIONS_PER_CHUNK = 2;
    const BUFFER_MULTIPLIER = 1.5;
    const MAX_QUESTIONS_PER_CHUNK = 25;

    // Calculate questions per chunk
    const questionsPerChunk = Math.max(
      MIN_QUESTIONS_PER_CHUNK,
      Math.min(
        MAX_QUESTIONS_PER_CHUNK,
        Math.ceil(state.questionCount / packedChunks.length * BUFFER_MULTIPLIER)
      )
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
      focus: state.focus,
    }, null, 2));

    console.log(`[QuizGraph] Creating ${packedChunks.length} parallel map tasks (~${questionsPerChunk} questions/chunk)`);

    return packedChunks.map((chunk, idx) => {
      const preview = chunk.substring(0, 100).replace(/\n/g, ' ');
      console.log(`  [Task ${idx + 1}/${packedChunks.length}] ${preview}... (${chunk.length} chars)`);
      return new Send('map_process', {
        chunk,
        chunkIndex: idx,
        questionCount: state.questionCount,
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

    const sanitizedFocus = focus ? sanitizeUserInput(focus) : undefined;
    const prompt = getMapPrompt({ chunk, questionCount, questionsPerChunk, difficulty, focus: sanitizedFocus });

    logInfo({
      agent: 'QuizGraph',
      phase: 'map_process',
      chunkId,
      promptLength: prompt.length,
    }, `Sending prompt to LLM (${prompt.length} chars)...`);

    let output: string;
    let questionsGenerated = 0;

    try {
      const response: QuizQuestionResponse = await invokeWithRetry(
        () => invokeWithTimeout(
          () => this.fastLlmStructured.invoke([
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

      questionsGenerated = response.questions.length;
      output = JSON.stringify(response.questions);
    } catch (error) {
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

      output = '[]';
      questionsGenerated = 0;
    }

    const elapsed = Date.now() - startTime;

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
  private async collapse(state: OverallStateType): Promise<Partial<OverallStateType>> {
    console.log(`\n${'='.repeat(80)}`);
    console.log('[QuizGraph] ===== COLLAPSE PHASE =====');
    console.log('='.repeat(80));

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
      reduceChunkSize: GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS,
    }, `Total tokens: ${totalTokens}, Reduce chunk size: ${GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS} tokens`);

    if (totalTokens <= GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS) {
      logInfo({
        agent: 'QuizGraph',
        phase: 'collapse_skip',
        totalTokens,
        reduceChunkSize: GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS,
      }, 'Collapse: skipping recursive collapse, using mapOutputs directly');

      // Calculate memory freed before clearing
      const mapOutputsSize = state.mapOutputs.reduce((sum, s) => sum + s.length * 2, 0);
      logInfo({
        agent: 'QuizGraph',
        phase: 'collapse_cleanup',
        memoryFreedKB: (mapOutputsSize / 1024).toFixed(2),
      }, `Freeing ~${(mapOutputsSize / 1024).toFixed(2)} KB from mapOutputs`);

      return {
        ...state,
        collapsedOutputs: state.mapOutputs,
        status: 'reducing',
        // Clear mapOutputs to free memory - no longer needed after collapse
        ...clearStateKeys<OverallStateType>(['mapOutputs']),
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
      totalTokens,
      reduceChunkSize: GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS,
    }, 'Collapse: performing recursive collapse');
    const collapsed = await this.recursiveCollapse(state.mapOutputs);

    // Calculate memory freed before clearing
    const mapOutputsSize = state.mapOutputs.reduce((sum, s) => sum + s.length * 2, 0);
    logInfo({
      agent: 'QuizGraph',
      phase: 'collapse_cleanup',
      memoryFreedKB: (mapOutputsSize / 1024).toFixed(2),
    }, `Freeing ~${(mapOutputsSize / 1024).toFixed(2)} KB from mapOutputs`);

    return {
      ...state,
      collapsedOutputs: collapsed,
      status: 'reducing',
      // Clear mapOutputs to free memory - no longer needed after collapse
      ...clearStateKeys<OverallStateType>(['mapOutputs']),
      progress: {
        phase: 'collapse',
        percentage: 70,
        message: `Collapsed ${state.mapOutputs.length} outputs into ${collapsed.length}`,
      },
    };
  }

  private async recursiveCollapse(outputs: string[], depth: number = 0): Promise<string[]> {
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

    if (totalTokens <= GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS) {
      return outputs;
    }

    const targetGroupTokens = GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS * 0.8;
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


  /**
   * Heuristic deduplication using text similarity.
   * Compares questions for overlap and removes duplicates above threshold.
   * This is much faster than LLM-based deduplication and works well for quiz questions.
   */
  private heuristicDedupe(questions: QuizQuestion[]): QuizQuestion[] {
    if (questions.length <= 1) return questions;

    const SIMILARITY_THRESHOLD = 0.8; // 80% similarity considered duplicate
    const toRemove = new Set<number>();

    for (let i = 0; i < questions.length; i++) {
      if (toRemove.has(i)) continue;

      for (let j = i + 1; j < questions.length; j++) {
        if (toRemove.has(j)) continue;

        const similarity = this.calculateSimilarity(questions[i], questions[j]);
        if (similarity >= SIMILARITY_THRESHOLD) {
          // Remove the second duplicate (keep the first one)
          toRemove.add(j);
        }
      }
    }

    const uniqueCount = questions.length - toRemove.size;
    logInfo({
      agent: 'QuizGraph',
      phase: 'heuristic_dedupe',
      inputCount: questions.length,
      duplicatesFound: toRemove.size,
      outputCount: uniqueCount,
    }, `Heuristic dedupe: ${questions.length} → ${uniqueCount} questions (removed ${toRemove.size} duplicates)`);

    return questions.filter((_, idx) => !toRemove.has(idx));
  }

  /**
   * Calculate text similarity between two quiz questions.
   * Returns a value between 0 (no similarity) and 1 (identical).
   */
  private calculateSimilarity(q1: QuizQuestion, q2: QuizQuestion): number {
    // Stop words to filter out for better similarity detection
    const stopWords = new Set([
      'the', 'is', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'by',
      'for', 'with', 'from', 'as', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
      'may', 'might', 'must', 'can', 'what', 'which', 'who', 'when', 'where', 'why', 'how'
    ]);

    // Extract words and filter stop words
    const extractWords = (text: string): Set<string> => {
      const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ');
      const words = (normalized.match(/\b\w+\b/g) || []);
      return new Set(words.filter(w => !stopWords.has(w)));
    };

    const q1Text = q1.question;
    const q2Text = q2.question;

    // Calculate word overlap for question text (without stop words)
    const words1 = extractWords(q1Text);
    const words2 = extractWords(q2Text);

    // If both questions have very few meaningful words, consider them less similar
    if (words1.size <= 1 || words2.size <= 1) {
      // Short questions need higher threshold to be considered similar
      const textSimilarity = q1Text === q2Text ? 1 : 0;
      return textSimilarity;
    }

    // Calculate Jaccard similarity: intersection / union
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    const questionSimilarity = union.size > 0 ? intersection.size / union.size : 0;

    // Also check if options are similar (if question text is similar)
    let optionsSimilarity = 0;
    if (questionSimilarity > 0.5) {
      const normalize = (text: string) => text.toLowerCase().trim().replace(/\s+/g, ' ');
      const q1Options = q1.options.map(normalize);
      const q2Options = q2.options.map(normalize);

      let optionMatches = 0;
      for (const opt1 of q1Options) {
        for (const opt2 of q2Options) {
          const optWords1 = extractWords(opt1);
          const optWords2 = extractWords(opt2);
          const optIntersection = new Set([...optWords1].filter(w => optWords2.has(w)));
          const optUnion = new Set([...optWords1, ...optWords2]);
          if (optUnion.size > 0 && optIntersection.size / optUnion.size > 0.7) {
            optionMatches++;
          }
        }
      }
      optionsSimilarity = optionMatches / 4; // 4 options total
    }

    // Weight question similarity more heavily than options
    return Math.max(questionSimilarity, questionSimilarity * 0.7 + optionsSimilarity * 0.3);
  }

  private async collapseGroup(group: string[]): Promise<string> {
    // Flatten all question arrays
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

    // Use heuristic deduplication to reduce tokens
    // This is much faster than LLM and works well for quiz questions
    const uniqueQuestions = this.heuristicDedupe(allQuestions);

    return JSON.stringify(uniqueQuestions);
  }


  // Node: Reduce phase
  private async reduce(state: OverallStateType): Promise<Partial<OverallStateType> | Send> {
    logPhaseStart({
      agent: 'QuizGraph',
      phase: 'reduce',
      collapsedOutputsCount: state.collapsedOutputs.length,
      targetQuestionCount: state.questionCount,
      difficulty: state.difficulty,
      focus: state.focus || 'none',
    });

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

    logInfo({
      agent: 'QuizGraph',
      phase: 'reduce_after_flatten',
      initialQuestionCount: totalQuestionsBefore,
    }, `Flattened ${totalQuestionsBefore} questions - running LLM refinement...`);

    // ALWAYS run LLM refinement for quality control (deduplication, merging, semantic diversity)
    // This ensures consistent behavior regardless of question count
    const retryCount = state.reduceRetryCount ?? 0;

    logInfo({
      agent: 'QuizGraph',
      phase: 'reduce_llm_selection',
      totalQuestionsBefore,
      targetQuestionCount: state.questionCount,
      retryAttempt: retryCount + 1,
      reason: 'Running LLM refinement for deduplication, quality selection, and topic diversity',
    }, `Using smart LLM for intelligent question refinement from ${totalQuestionsBefore} questions [Attempt ${retryCount + 1}/2]...`);

    const similarQuestions = this.detectSimilarQuestions(allQuestions);

    if (similarQuestions.length > 0) {
      logInfo({
        agent: 'QuizGraph',
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
      const structuredLlm = this.smartLlm.withStructuredOutput<QuizQuestionResponse>(
        QuizQuestionArraySchema,
        { name: 'quiz_selection' }
      );

      const selectionPrompt = getSelectionPrompt({
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
        originalCount: totalQuestionsBefore,
      }, `LLM refinement complete: ${totalQuestionsBefore} → ${response.questions.length} questions`);

      if (response.questions.length === 0) {
        throw new Error('LLM returned zero questions');
      }

      return this.finalizeQuestions(response.questions, state);
    } catch (error) {
      logError({
        agent: 'QuizGraph',
        phase: 'reduce_llm_failed',
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
        } : String(error),
      }, `LLM reduce failed, falling back to simple slice`);

      const fallback = allQuestions.slice(0, state.questionCount);

      if (fallback.length === 0 && retryCount < 1) {
        return new Send('reduce', {
          ...state,
          reduceRetryCount: retryCount + 1,
        } as any);
      }

      return this.finalizeQuestions(fallback, state);
    }
  }

  // Helper method to finalize and return questions
  private finalizeQuestions(questions: QuizQuestion[], state: OverallStateType): Partial<OverallStateType> {
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

    for (const q of questions) {
      if (typeof q.answer !== 'number' || q.answer < 0 || q.answer > 3) {
        logWarn({
          agent: 'QuizGraph',
          phase: 'finalize_questions',
          question: q.question.substring(0, 100),
          answer: q.answer,
        }, `Invalid answer index: ${q.answer} (must be 0-3)`);
      }
    }

    for (const q of questions) {
      if (q.explanation.length < 20) {
        logWarn({
          agent: 'QuizGraph',
          phase: 'finalize_questions',
          question: q.question.substring(0, 100),
          explanationLength: q.explanation.length,
        }, `Explanation too short (may indicate poor grounding)`);
      }
    }

    logInfo({
      agent: 'QuizGraph',
      phase: 'reduce',
      questionsGenerated: questions.length,
      targetQuestionCount: state.questionCount,
    }, `Generated ${questions.length} questions (target: ${state.questionCount})`);

    if (questions.length !== state.questionCount) {
      logWarn({
        agent: 'QuizGraph',
        phase: 'reduce_count_mismatch',
        generatedCount: questions.length,
        targetCount: state.questionCount,
      }, `LLM returned ${questions.length} questions, target was ${state.questionCount}. Accepting LLM result.`);
    }

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

    // Calculate memory to be freed
    const collapsedOutputsSize = state.collapsedOutputs.reduce((sum, s) => sum + s.length * 2, 0);
    const chunksSize = (state.chunks || []).reduce((sum, s) => sum + s.length * 2, 0);
    logInfo({
      agent: 'QuizGraph',
      phase: 'reduce_cleanup',
      memoryFreedKB: ((collapsedOutputsSize + chunksSize) / 1024).toFixed(2),
    }, `Freeing ~${((collapsedOutputsSize + chunksSize) / 1024).toFixed(2)} KB from intermediate data`);

    return {
      ...state,
      finalOutput: questions,
      status: 'completed',
      // Clear collapsedOutputs and chunks to free memory - no longer needed after reduce
      ...clearStateKeys<OverallStateType>(['collapsedOutputs', 'chunks']),
      progress: {
        phase: 'reduce',
        percentage: 100,
        message: `Completed: ${questions.length} quiz questions generated`,
        questionsGenerated: questions.length,
      },
    };
  }

  /**
   * Detect semantically similar questions using simple heuristics.
   */
  private detectSimilarQuestions(questions: QuizQuestion[]): Array<{
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
   * Build the state graph for quiz question generation.
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
