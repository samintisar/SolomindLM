"use node"

import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Send } from '@langchain/langgraph';

import {
  createLangSmithRunConfig,
  invokeWithRetry,
  invokeWithTimeout,
  logError,
  logInfo,
  logPhaseStart,
  logWarn,
} from '../_shared/index.js';

import { GRAPH_CONFIG } from './config.js';
import {
  REDUCE_SELECT_SYSTEM_PROMPT,
  WrittenQuestionsArraySchema,
  type WrittenQuestion,
  type WrittenQuestionsResponse,
} from './prompts.js';
import { callStatusUpdate } from './nodeSplit.js';
import { detectSimilarQuestions } from './questionHeuristics.js';
import { finalizeQuestions, getSelectionPrompt } from './postprocess.js';
import type { OverallStateType } from './state.js';

export async function reduce(
  state: OverallStateType,
  smartLlm: ChatTogetherAI
): Promise<Partial<OverallStateType> | Send> {
  await callStatusUpdate(state, 'reducing');

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
    await callStatusUpdate(state, 'failed');
    return {
      ...state,
      finalOutput: [],
      status: 'failed',
    };
  }

  const normalizeQuestion = (question: string): string => {
    return question
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();
  };

  const dedupedQuestions: WrittenQuestion[] = [];
  const seenQuestions = new Set<string>();
  for (const question of allQuestions) {
    const normalizedQuestion = normalizeQuestion(question.question);
    if (seenQuestions.has(normalizedQuestion)) {
      continue;
    }
    seenQuestions.add(normalizedQuestion);
    dedupedQuestions.push(question);
  }

  const smartReduceThreshold = state.questionCount + Math.max(2, Math.ceil(state.questionCount * 0.25));

  logInfo({
    agent: 'WrittenQuestionsGraph',
    phase: 'reduce_after_dedupe',
    totalQuestionsBefore,
    dedupedQuestionCount: dedupedQuestions.length,
    smartReduceThreshold,
  }, `Flattened ${totalQuestionsBefore} questions, ${dedupedQuestions.length} remain after heuristic dedupe`);

  if (dedupedQuestions.length <= state.questionCount) {
    logInfo({
      agent: 'WrittenQuestionsGraph',
      phase: 'reduce_skip',
      totalQuestionsExtracted: dedupedQuestions.length,
      targetQuestionCount: state.questionCount,
      reason: 'Question pool is already at or below target after heuristic dedupe',
    }, `Skipping LLM reduce, using ${dedupedQuestions.length} questions directly`);

    const result = finalizeQuestions(dedupedQuestions, state);
    return {
      ...result,
      progress: {
        phase: 'reduce',
        percentage: 100,
        message: `Completed: ${dedupedQuestions.length} questions generated`,
        itemsGenerated: dedupedQuestions.length,
      },
    };
  }

  if (dedupedQuestions.length <= smartReduceThreshold) {
    const similarQuestions = detectSimilarQuestions(dedupedQuestions);

    if (similarQuestions.length === 0) {
      const skippedSelection = dedupedQuestions.slice(0, state.questionCount);
      logInfo({
        agent: 'WrittenQuestionsGraph',
        phase: 'reduce_skip_llm',
        candidateCount: dedupedQuestions.length,
        targetQuestionCount: state.questionCount,
        smartReduceThreshold,
      }, `Skipping smart reduce: ${dedupedQuestions.length} heuristically clean questions are already near target`);

      const result = finalizeQuestions(skippedSelection, state);
      return {
        ...result,
        progress: {
          phase: 'reduce',
          percentage: 100,
          message: `Completed: ${skippedSelection.length} questions generated`,
          itemsGenerated: skippedSelection.length,
        },
      };
    }

    logInfo({
      agent: 'WrittenQuestionsGraph',
      phase: 'reduce_keep_llm',
      candidateCount: dedupedQuestions.length,
      duplicateGroups: similarQuestions.length,
      reason: 'Near target but heuristic verifier still found overlaps',
    }, `Keeping smart reduce for ${dedupedQuestions.length} near-target questions because ${similarQuestions.length} duplicate groups remain`);
  }

  const retryCount = state.reduceRetryCount ?? 0;

  const MAX_QUESTIONS_FOR_LLM = 50;
  let questionsForLLM = dedupedQuestions;

  if (questionsForLLM.length > MAX_QUESTIONS_FOR_LLM) {
    const shuffled = [...questionsForLLM].sort(() => Math.random() - 0.5);
    questionsForLLM = shuffled.slice(0, MAX_QUESTIONS_FOR_LLM);

    logInfo({
      agent: 'WrittenQuestionsGraph',
      phase: 'reduce_safety_cap',
      totalQuestionsBefore: dedupedQuestions.length,
      sampledDownTo: MAX_QUESTIONS_FOR_LLM,
      targetQuestionCount: state.questionCount,
      reason: 'Context window safety cap after heuristic dedupe',
    }, `Randomly sampled ${dedupedQuestions.length} questions down to ${MAX_QUESTIONS_FOR_LLM} before LLM selection`);
  }

  logInfo({
    agent: 'WrittenQuestionsGraph',
    phase: 'reduce_llm_selection',
    totalQuestionsBefore,
    dedupedQuestionCount: dedupedQuestions.length,
    questionsForLLM: questionsForLLM.length,
    targetQuestionCount: state.questionCount,
    retryAttempt: retryCount + 1,
    reason: 'Using smart reduce after heuristic dedupe because the pool is still large or messy',
  }, `Using smart LLM for intelligent question selection from ${questionsForLLM.length} questions [Attempt ${retryCount + 1}/2]...`);

  const similarQuestions = detectSimilarQuestions(questionsForLLM);

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
    const structuredLlm = smartLlm.withStructuredOutput<WrittenQuestionsResponse>(
      WrittenQuestionsArraySchema,
      { name: 'written_questions_selection' }
    );

    const selectionPrompt = getSelectionPrompt({
      questions: questionsForLLM,
      targetCount: state.questionCount,
      difficulty: state.difficulty,
      questionType: state.questionType,
      focus: state.focus,
    });

    const response: WrittenQuestionsResponse = await invokeWithRetry(
      () => invokeWithTimeout(
        () => (structuredLlm as any).invoke([
          new SystemMessage(REDUCE_SELECT_SYSTEM_PROMPT),
          new HumanMessage(selectionPrompt),
        ], createLangSmithRunConfig({
          runName: 'WrittenQuestionsGraph.ReduceSelect',
          tags: ['agent', 'written-questions', 'reduce'],
          metadata: {
            targetCount: state.questionCount,
            difficulty: state.difficulty,
            questionType: state.questionType,
            focus: state.focus || 'none',
            candidateCount: questionsForLLM.length,
          },
        })),
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
        },
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

    const result = finalizeQuestions(response.questions, state);
    return {
      ...result,
      progress: {
        phase: 'reduce',
        percentage: 100,
        message: `Completed: ${response.questions.length} unique questions (target: ${state.questionCount})`,
        itemsGenerated: response.questions.length,
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

    logError(errorContext, 'LLM reduce failed, retrying...');

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

    const fallback = dedupedQuestions.slice(0, state.questionCount);
    const result = finalizeQuestions(fallback, state);
    return {
      ...result,
      progress: {
        phase: 'reduce',
        percentage: 100,
        message: `Completed: ${fallback.length} questions (target: ${state.questionCount}, fallback mode)`,
        itemsGenerated: fallback.length,
      },
    };
  }
}
