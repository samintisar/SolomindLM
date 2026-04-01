"use node"

import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Send } from '@langchain/langgraph';

import {
  allWithConcurrency,
  createLangSmithRunConfig,
  invokeWithRetry,
  invokeWithTimeout,
  logError,
  logInfo,
  logPhaseStart,
  logWarn,
} from '../_shared/index.js';

import { GRAPH_CONFIG } from './config.js';
import { callStatusUpdate } from './nodeSplit.js';
import { expandQuestion, finalizeQuestions } from './postprocess.js';
import {
  getCandidateSelectionPrompt,
  QuizCandidateArraySchema,
  REDUCE_SELECT_SYSTEM_PROMPT,
  type QuizCandidate,
  type QuizCandidateResponse,
  type QuizQuestion,
} from './prompts.js';
import { detectSimilarQuestions, heuristicDedupe } from './quizHeuristics.js';
import type { OverallStateType } from './state.js';
import type { StructuredOutputInvoker } from './structuredLlm.js';

export interface ReduceQuizDeps {
  smartLlm: ChatTogetherAI;
  expandLlmQuestionStructured: StructuredOutputInvoker<QuizQuestion>;
}

export async function reduce(
  state: OverallStateType,
  deps: ReduceQuizDeps
): Promise<Partial<OverallStateType> | Send> {
  await callStatusUpdate(state, 'reducing');

  logPhaseStart({
    agent: 'QuizGraph',
    phase: 'reduce',
    collapsedOutputsCount: state.collapsedOutputs.length,
    targetQuestionCount: state.questionCount,
    difficulty: state.difficulty,
    focus: state.focus || 'none',
  });

  const allCandidates: QuizCandidate[] = [];
  for (const output of state.collapsedOutputs) {
    try {
      const parsed = JSON.parse(output) as QuizCandidate[];
      allCandidates.push(...parsed);
    } catch (e) {
      logWarn({
        agent: 'QuizGraph',
        phase: 'reduce_parse_error',
        error: e instanceof Error ? e.message : String(e),
      }, 'Failed to parse question array in reduce');
    }
  }

  const totalCandidatesBefore = allCandidates.length;

  if (totalCandidatesBefore === 0) {
    logError({
      agent: 'QuizGraph',
      phase: 'reduce',
      error: 'No candidates generated',
    }, 'CRITICAL: No candidates in collapsed outputs!');
    await callStatusUpdate(state, 'failed');
    return {
      ...state,
      finalOutput: [],
      status: 'failed',
    };
  }

  const dedupedCandidates = heuristicDedupe(allCandidates);
  const smartReduceThreshold = state.questionCount + Math.max(2, Math.ceil(state.questionCount * 0.25));
  const retryCount = state.reduceRetryCount ?? 0;

  logInfo({
    agent: 'QuizGraph',
    phase: 'reduce_after_flatten',
    initialQuestionCount: totalCandidatesBefore,
    dedupedQuestionCount: dedupedCandidates.length,
    smartReduceThreshold,
  }, `Flattened ${totalCandidatesBefore} candidates, ${dedupedCandidates.length} remain after heuristic dedupe`);

  let selectedCandidates: QuizCandidate[] | null = null;

  if (dedupedCandidates.length <= smartReduceThreshold) {
    const similarQuestions = detectSimilarQuestions(dedupedCandidates);

    if (similarQuestions.length === 0) {
      selectedCandidates = dedupedCandidates.slice(0, state.questionCount);
      logInfo({
        agent: 'QuizGraph',
        phase: 'reduce_skip_llm',
        candidateCount: dedupedCandidates.length,
        targetQuestionCount: state.questionCount,
        smartReduceThreshold,
      }, `Skipping smart reduce: ${dedupedCandidates.length} heuristically clean candidates are already near target`);
    } else {
      logInfo({
        agent: 'QuizGraph',
        phase: 'reduce_keep_llm',
        candidateCount: dedupedCandidates.length,
        duplicateGroups: similarQuestions.length,
        reason: 'Near target but heuristic verifier still found overlaps',
      }, `Keeping smart reduce for ${dedupedCandidates.length} near-target candidates because ${similarQuestions.length} duplicate groups remain`);
    }
  }

  if (selectedCandidates === null) {
    logInfo({
      agent: 'QuizGraph',
      phase: 'reduce_llm_selection',
      totalQuestionsBefore: totalCandidatesBefore,
      dedupedQuestionCount: dedupedCandidates.length,
      targetQuestionCount: state.questionCount,
      retryAttempt: retryCount + 1,
      reason: 'Using smart reduce after heuristic dedupe because the pool is still large or messy',
    }, `Using smart LLM for intelligent candidate selection from ${dedupedCandidates.length} candidates [Attempt ${retryCount + 1}/2]...`);

    try {
      const structuredLlm = deps.smartLlm.withStructuredOutput<QuizCandidateResponse>(
        QuizCandidateArraySchema,
        { name: 'quiz_candidate_selection' }
      );

      const selectionPrompt = getCandidateSelectionPrompt({
        candidates: dedupedCandidates,
        targetCount: state.questionCount,
        difficulty: state.difficulty,
        focus: state.focus,
      });

      const response: QuizCandidateResponse = await invokeWithRetry(
        () => invokeWithTimeout(
          () => (structuredLlm as any).invoke([
            new SystemMessage(REDUCE_SELECT_SYSTEM_PROMPT),
            new HumanMessage(selectionPrompt),
          ], createLangSmithRunConfig({
            runName: 'QuizGraph.ReduceSelect',
            tags: ['agent', 'quiz', 'reduce'],
            metadata: {
              targetQuestionCount: state.questionCount,
              difficulty: state.difficulty,
              focus: state.focus || 'none',
              candidatesCount: dedupedCandidates.length,
            },
          })),
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

      selectedCandidates = response.questions;

      logInfo({
        agent: 'QuizGraph',
        phase: 'reduce_llm_success',
        selectedCount: selectedCandidates.length,
        originalCount: totalCandidatesBefore,
        dedupedCount: dedupedCandidates.length,
      }, `LLM refinement complete: ${dedupedCandidates.length} → ${selectedCandidates.length} candidates`);

      if (selectedCandidates.length === 0) {
        throw new Error('LLM returned zero candidates');
      }
    } catch (error) {
      logError({
        agent: 'QuizGraph',
        phase: 'reduce_llm_failed',
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
        } : String(error),
      }, 'LLM reduce failed, falling back to heuristic slice');

      const fallback = dedupedCandidates.slice(0, state.questionCount);

      if (fallback.length === 0 && retryCount < 1) {
        return new Send('reduce', {
          ...state,
          reduceRetryCount: retryCount + 1,
        } as any);
      }

      selectedCandidates = fallback;
    }
  }

  if (!selectedCandidates || selectedCandidates.length === 0) {
    return {
      ...state,
      finalOutput: [],
      status: 'failed',
    };
  }

  const expandConcurrency = GRAPH_CONFIG.EXPAND_CONCURRENCY;
  logInfo({
    agent: 'QuizGraph',
    phase: 'expand_questions',
    selectedCount: selectedCandidates.length,
    concurrency: expandConcurrency,
  }, `Generating distractors for ${selectedCandidates.length} questions (concurrency: ${expandConcurrency})...`);

  const expandDeps = { expandLlmQuestionStructured: deps.expandLlmQuestionStructured };
  const expandedResults = await allWithConcurrency(
    selectedCandidates.map((candidate, index) => {
      return async () => {
        try {
          return await expandQuestion(candidate, expandDeps);
        } catch (error) {
          logWarn({
            agent: 'QuizGraph',
            phase: 'expand_question_failed',
            index,
            error: error instanceof Error ? error.message : String(error),
          }, 'Failed to expand candidate');
          return null;
        }
      };
    }),
    expandConcurrency
  );

  const expandedQuestions = expandedResults.filter((q): q is QuizQuestion => q !== null);
  const failedCount = expandedResults.length - expandedQuestions.length;
  if (failedCount > 0) {
    logWarn({
      agent: 'QuizGraph',
      phase: 'expand_questions_failed',
      failedCount,
    }, `${failedCount} candidate expansions failed`);
  }

  if (expandedQuestions.length === 0) {
    return {
      ...state,
      finalOutput: [],
      status: 'failed',
    };
  }

  return finalizeQuestions(expandedQuestions, state);
}
