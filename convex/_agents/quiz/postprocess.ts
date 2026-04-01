"use node"

import { HumanMessage, SystemMessage } from '@langchain/core/messages';

import {
  createLangSmithRunConfig,
  invokeWithRetry,
  invokeWithTimeout,
  logBanner,
  logInfo,
  logWarn,
  validateQuiz,
  clearStateKeys,
} from '../_shared/index.js';

import { GRAPH_CONFIG } from './config.js';
import {
  EXPAND_QUESTION_SYSTEM_PROMPT,
  getExpandPrompt,
  type QuizCandidate,
  type QuizQuestion,
} from './prompts.js';
import type { OverallStateType } from './state.js';
import type { StructuredOutputInvoker } from './structuredLlm.js';

export interface ExpandQuestionDeps {
  expandLlmQuestionStructured: StructuredOutputInvoker<QuizQuestion>;
}

export async function expandQuestion(
  candidate: QuizCandidate,
  deps: ExpandQuestionDeps
): Promise<QuizQuestion> {
  const prompt = getExpandPrompt(candidate);

  return invokeWithRetry(
    () => invokeWithTimeout(
      () => (deps.expandLlmQuestionStructured as any).invoke([
        new SystemMessage(EXPAND_QUESTION_SYSTEM_PROMPT),
        new HumanMessage(prompt),
      ], createLangSmithRunConfig({
        runName: 'QuizGraph.ExpandQuestion',
        tags: ['agent', 'quiz', 'expand'],
        metadata: {
          difficulty: candidate.difficulty,
          topic: candidate.topic,
        },
      })),
      GRAPH_CONFIG.MAP_TIMEOUT_MS,
      'QuizExpand'
    ),
    {
      maxAttempts: 2,
      baseDelayMs: 1000,
      onRetry: (attempt, error) => {
        logWarn({
          agent: 'QuizGraph',
          phase: 'expand_question_retry',
          attempt,
          error: error.message,
        }, `LLM expand retry attempt ${attempt}/2`);
      }
    },
    'QuizExpand'
  );
}

export function finalizeQuestions(
  questions: QuizQuestion[],
  state: OverallStateType
): Partial<OverallStateType> {
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
    ...clearStateKeys<OverallStateType>(['collapsedOutputs', 'chunks']),
    progress: {
      phase: 'reduce',
      percentage: 100,
      message: `Completed: ${questions.length} quiz questions generated`,
      itemsGenerated: questions.length,
    },
  };
}
