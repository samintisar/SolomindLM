"use node";

import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { Send } from "@langchain/langgraph";

import {
  allWithConcurrency,
  createLangSmithRunConfig,
  invokeWithRetry,
  invokeWithTimeout,
  withoutMapOutputs,
} from "../_shared/index.js";
import { createAgentGraphLogger } from "../_shared/logging.js";

import { GRAPH_CONFIG } from "./config.js";
import { callStatusUpdate } from "./nodeSplit.js";
import { expandQuestion, finalizeQuestions } from "./postprocess.js";
import {
  applySelectedCandidateIndices,
  getCandidateSelectionPrompt,
  QuizCandidateIndexSelectionSchema,
  REDUCE_SELECT_SYSTEM_PROMPT,
  type QuizCandidate,
  type QuizCandidateIndexSelection,
  type QuizQuestion,
} from "./prompts.js";
import { detectSimilarQuestions, heuristicDedupe } from "./quizHeuristics.js";
import type { OverallStateType } from "./state.js";
import type { StructuredOutputInvoker } from "./structuredLlm.js";

export interface ReduceQuizDeps {
  smartLlm: ChatTogetherAI;
  expandLlmQuestionStructured: StructuredOutputInvoker<QuizQuestion>;
}

export async function reduce(
  state: OverallStateType,
  deps: ReduceQuizDeps
): Promise<Partial<OverallStateType> | Send> {
  const logger = createAgentGraphLogger("QuizGraph", "quiz");
  await callStatusUpdate(state, "reducing");

  logger.phaseStart("reduce", {
    agent: "QuizGraph",
    collapsedOutputsCount: state.collapsedOutputs.length,
    targetQuestionCount: state.questionCount,
    difficulty: state.difficulty,
    focus: state.focus || "none",
  });

  const allCandidates: QuizCandidate[] = [];
  for (const output of state.collapsedOutputs) {
    try {
      const parsed = JSON.parse(output) as QuizCandidate[];
      allCandidates.push(...parsed);
    } catch (e) {
      logger.warn("Failed to parse question array in reduce", {
        agent: "QuizGraph",
        phase: "reduce_parse_error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const totalCandidatesBefore = allCandidates.length;

  if (totalCandidatesBefore === 0) {
    logger.phaseError("reduce", new Error("No candidates generated"), {
      agent: "QuizGraph",
    });
    await callStatusUpdate(state, "failed");
    return {
      finalOutput: [],
      status: "failed",
    };
  }

  const dedupedCandidates = heuristicDedupe(allCandidates);
  const smartReduceThreshold =
    state.questionCount + Math.max(2, Math.ceil(state.questionCount * 0.25));
  const retryCount = state.reduceRetryCount ?? 0;

  logger.info(
    `Flattened ${totalCandidatesBefore} candidates, ${dedupedCandidates.length} remain after heuristic dedupe`,
    {
      agent: "QuizGraph",
      phase: "reduce_after_flatten",
      initialQuestionCount: totalCandidatesBefore,
      dedupedQuestionCount: dedupedCandidates.length,
      smartReduceThreshold,
    }
  );

  let selectedCandidates: QuizCandidate[] | null = null;

  if (dedupedCandidates.length <= smartReduceThreshold) {
    const similarQuestions = detectSimilarQuestions(dedupedCandidates);

    if (similarQuestions.length === 0) {
      selectedCandidates = dedupedCandidates.slice(0, state.questionCount);
      logger.info(
        `Skipping smart reduce: ${dedupedCandidates.length} heuristically clean candidates are already near target`,
        {
          agent: "QuizGraph",
          phase: "reduce_skip_llm",
          candidateCount: dedupedCandidates.length,
          targetQuestionCount: state.questionCount,
          smartReduceThreshold,
        }
      );
    } else {
      logger.info(
        `Keeping smart reduce for ${dedupedCandidates.length} near-target candidates because ${similarQuestions.length} duplicate groups remain`,
        {
          agent: "QuizGraph",
          phase: "reduce_keep_llm",
          candidateCount: dedupedCandidates.length,
          duplicateGroups: similarQuestions.length,
          reason: "Near target but heuristic verifier still found overlaps",
        }
      );
    }
  }

  if (selectedCandidates === null) {
    logger.info(
      `Using smart LLM for intelligent candidate selection from ${dedupedCandidates.length} candidates [Attempt ${retryCount + 1}/2]...`,
      {
        agent: "QuizGraph",
        phase: "reduce_llm_selection",
        totalQuestionsBefore: totalCandidatesBefore,
        dedupedQuestionCount: dedupedCandidates.length,
        targetQuestionCount: state.questionCount,
        retryAttempt: retryCount + 1,
        reason:
          "Using smart reduce after heuristic dedupe because the pool is still large or messy",
      }
    );

    try {
      const structuredLlm = deps.smartLlm.withStructuredOutput<QuizCandidateIndexSelection>(
        QuizCandidateIndexSelectionSchema,
        { name: "quiz_candidate_index_selection" }
      );

      const selectionPrompt = getCandidateSelectionPrompt({
        candidates: dedupedCandidates,
        targetCount: state.questionCount,
        difficulty: state.difficulty,
        focus: state.focus,
      });

      const response: QuizCandidateIndexSelection = await invokeWithRetry(
        () =>
          invokeWithTimeout(
            () =>
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (structuredLlm as any).invoke(
                [new SystemMessage(REDUCE_SELECT_SYSTEM_PROMPT), new HumanMessage(selectionPrompt)],
                createLangSmithRunConfig({
                  runName: "QuizGraph.ReduceSelect",
                  tags: ["agent", "quiz", "reduce"],
                  metadata: {
                    targetQuestionCount: state.questionCount,
                    difficulty: state.difficulty,
                    focus: state.focus || "none",
                    candidatesCount: dedupedCandidates.length,
                  },
                })
              ),
            GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
            "QuizReduce"
          ),
        {
          maxAttempts: 2,
          baseDelayMs: 1000,
          onRetry: (attempt, error) => {
            logger.warn(`LLM reduce retry attempt ${attempt}/2`, {
              agent: "QuizGraph",
              phase: "reduce_llm_retry",
              attempt,
              error: error.message,
            });
          },
        },
        "QuizReduce"
      );

      selectedCandidates = applySelectedCandidateIndices(
        dedupedCandidates,
        response.selectedIndices ?? [],
        state.questionCount
      );

      logger.info(
        `LLM refinement complete: ${dedupedCandidates.length} → ${selectedCandidates.length} candidates`,
        {
          agent: "QuizGraph",
          phase: "reduce_llm_success",
          selectedCount: selectedCandidates.length,
          rawIndexCount: (response.selectedIndices ?? []).length,
          originalCount: totalCandidatesBefore,
          dedupedCount: dedupedCandidates.length,
        }
      );

      if (selectedCandidates.length === 0) {
        throw new Error("LLM returned zero resolvable candidates");
      }
    } catch (error) {
      logger.phaseError(
        "reduce_llm_failed",
        error instanceof Error ? error : new Error(String(error)),
        {
          agent: "QuizGraph",
        }
      );

      const fallback = dedupedCandidates.slice(0, state.questionCount);

      if (fallback.length === 0 && retryCount < 1) {
        return new Send("reduce", {
          ...withoutMapOutputs(state),
          reduceRetryCount: retryCount + 1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
      }

      selectedCandidates = fallback;
    }
  }

  if (!selectedCandidates || selectedCandidates.length === 0) {
    return {
      finalOutput: [],
      status: "failed",
    };
  }

  const expandConcurrency = GRAPH_CONFIG.EXPAND_CONCURRENCY;
  logger.info(
    `Generating distractors for ${selectedCandidates.length} questions (concurrency: ${expandConcurrency})...`,
    {
      agent: "QuizGraph",
      phase: "expand_questions",
      selectedCount: selectedCandidates.length,
      concurrency: expandConcurrency,
    }
  );

  const expandDeps = { expandLlmQuestionStructured: deps.expandLlmQuestionStructured };
  const expandedResults = await allWithConcurrency(
    selectedCandidates.map((candidate, index) => {
      return async () => {
        try {
          return await expandQuestion(candidate, expandDeps);
        } catch (error) {
          logger.warn("Failed to expand candidate", {
            agent: "QuizGraph",
            phase: "expand_question_failed",
            index,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      };
    }),
    expandConcurrency
  );

  const expandedQuestions = expandedResults.filter((q): q is QuizQuestion => q !== null);
  const failedCount = expandedResults.length - expandedQuestions.length;
  if (failedCount > 0) {
    logger.warn(`${failedCount} candidate expansions failed`, {
      agent: "QuizGraph",
      phase: "expand_questions_failed",
      failedCount,
    });
  }

  if (expandedQuestions.length === 0) {
    return {
      finalOutput: [],
      status: "failed",
    };
  }

  return finalizeQuestions(expandedQuestions, state, logger);
}
