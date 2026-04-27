"use node";

import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import {
  createLangSmithRunConfig,
  invokeWithRetry,
  invokeWithTimeout,
  validateQuiz,
  clearStateKeys,
  withoutMapOutputs,
} from "../_shared/index.js";
import type { JobLogger } from "../_shared/logging.js";
import { createAgentGraphLogger } from "../_shared/logging.js";

import { GRAPH_CONFIG } from "./config.js";
import { normalizeQuizQuestion } from "./optionLabels.js";
import {
  EXPAND_QUESTION_SYSTEM_PROMPT,
  getExpandPrompt,
  type QuizCandidate,
  type QuizQuestion,
} from "./prompts.js";
import type { OverallStateType } from "./state.js";
import type { StructuredOutputInvoker } from "./structuredLlm.js";

export interface ExpandQuestionDeps {
  expandLlmQuestionStructured: StructuredOutputInvoker<QuizQuestion>;
}

export async function expandQuestion(
  candidate: QuizCandidate,
  deps: ExpandQuestionDeps
): Promise<QuizQuestion> {
  const logger = createAgentGraphLogger("QuizGraph", "quiz");
  const prompt = getExpandPrompt(candidate);

  return invokeWithRetry(
    () =>
      invokeWithTimeout(
        () =>
          (deps.expandLlmQuestionStructured as any).invoke(
            [new SystemMessage(EXPAND_QUESTION_SYSTEM_PROMPT), new HumanMessage(prompt)],
            createLangSmithRunConfig({
              runName: "QuizGraph.ExpandQuestion",
              tags: ["agent", "quiz", "expand"],
              metadata: {
                difficulty: candidate.difficulty,
                topic: candidate.topic,
              },
            })
          ),
        GRAPH_CONFIG.MAP_TIMEOUT_MS,
        "QuizExpand"
      ),
    {
      maxAttempts: 2,
      baseDelayMs: 1000,
      onRetry: (attempt, error) => {
        logger.warn(`LLM expand retry attempt ${attempt}/2`, {
          agent: "QuizGraph",
          phase: "expand_question_retry",
          attempt,
          error: error.message,
        });
      },
    },
    "QuizExpand"
  );
}

export function finalizeQuestions(
  questions: QuizQuestion[],
  state: OverallStateType,
  logger: JobLogger
): Partial<OverallStateType> {
  const normalized = questions.map((q) => normalizeQuizQuestion(q));
  const validation = validateQuiz(JSON.stringify(normalized), state.questionCount);
  logger.info(`Finalizing ${normalized.length} questions`, {
    agent: "QuizGraph",
    phase: "reduce_after_parsing",
    questionsParsed: normalized.length,
    validation: {
      isValid: validation.isValid,
      warnings: validation.warnings,
      score: validation.score,
    },
  });

  for (const q of normalized) {
    if (typeof q.answer !== "number" || q.answer < 0 || q.answer > 3) {
      logger.warn(`Invalid answer index: ${q.answer} (must be 0-3)`, {
        agent: "QuizGraph",
        phase: "finalize_questions",
        question: q.question.substring(0, 100),
        answer: q.answer,
      });
    }
  }

  for (const q of normalized) {
    if (q.explanation.length < 20) {
      logger.warn("Explanation too short (may indicate poor grounding)", {
        agent: "QuizGraph",
        phase: "finalize_questions",
        question: q.question.substring(0, 100),
        explanationLength: q.explanation.length,
      });
    }
  }

  logger.info(`Generated ${normalized.length} questions (target: ${state.questionCount})`, {
    agent: "QuizGraph",
    phase: "reduce",
    questionsGenerated: normalized.length,
    targetQuestionCount: state.questionCount,
  });

  if (normalized.length !== state.questionCount) {
    logger.warn(
      `LLM returned ${normalized.length} questions, target was ${state.questionCount}. Accepting LLM result.`,
      {
        agent: "QuizGraph",
        phase: "reduce_count_mismatch",
        generatedCount: normalized.length,
        targetCount: state.questionCount,
      }
    );
  }

  logger.info("Reduce final question summary", {
    agent: "QuizGraph",
    phase: "reduce_final",
    finalQuestionCount: normalized.length,
    finalQuestions: normalized.map((q, idx) => ({
      index: idx + 1,
      question: q.question,
      optionsCount: q.options.length,
      answer: q.answer,
    })),
  });

  logger.info("GENERATION COMPLETE", {
    agent: "QuizGraph",
    phase: "generation_complete",
    finalQuestionCount: normalized.length,
    targetQuestionCount: state.questionCount,
    milestone: true,
  });

  const collapsedOutputsSize = state.collapsedOutputs.reduce((sum, s) => sum + s.length * 2, 0);
  const chunksSize = (state.chunks || []).reduce((sum, s) => sum + s.length * 2, 0);
  logger.info(
    `Freeing ~${((collapsedOutputsSize + chunksSize) / 1024).toFixed(2)} KB from intermediate data`,
    {
      agent: "QuizGraph",
      phase: "reduce_cleanup",
      memoryFreedKB: ((collapsedOutputsSize + chunksSize) / 1024).toFixed(2),
    }
  );

  return {
    ...withoutMapOutputs(state),
    finalOutput: normalized,
    status: "completed",
    ...clearStateKeys<OverallStateType>(["collapsedOutputs", "chunks"]),
    progress: {
      phase: "reduce",
      percentage: 100,
      message: `Completed: ${normalized.length} quiz questions generated`,
      itemsGenerated: normalized.length,
    },
  };
}
