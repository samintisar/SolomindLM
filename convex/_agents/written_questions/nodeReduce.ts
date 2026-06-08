"use node";

import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { Send } from "@langchain/langgraph";
import { env } from "../../_lib/env.js";
import { invokeWithRetry, invokeWithTimeout, withoutMapOutputs } from "../_shared/index.js";
import { createAgentGraphLogger } from "../_shared/logging.js";
import { GRAPH_CONFIG } from "./config.js";
import { callStatusUpdate } from "./nodeSplit.js";
import { finalizeQuestions, getSelectionPrompt } from "./postprocess.js";
import {
  REDUCE_SELECT_SYSTEM_PROMPT,
  type WrittenQuestion,
  WrittenQuestionsArraySchema,
  type WrittenQuestionsResponse,
} from "./prompts.js";
import { detectSimilarQuestions } from "./questionHeuristics.js";
import type { OverallStateType } from "./state.js";
import { createStructuredLLM } from "./structuredLlm.js";

export async function reduce(
  state: OverallStateType,
  smartLlm: ChatTogetherAI
): Promise<Partial<OverallStateType> | Send> {
  const logger = createAgentGraphLogger("WrittenQuestionsGraph", "written_questions");
  await callStatusUpdate(state, "reducing");

  logger.phaseStart("reduce", {
    agent: "WrittenQuestionsGraph",
    collapsedOutputsCount: state.collapsedOutputs.length,
    targetQuestionCount: state.questionCount,
    difficulty: state.difficulty,
    questionType: state.questionType,
    focus: state.focus || "none",
  });

  const allQuestions: WrittenQuestion[] = [];
  for (const output of state.collapsedOutputs) {
    try {
      const parsed = JSON.parse(output) as WrittenQuestion[];
      allQuestions.push(...parsed);
    } catch (e) {
      logger.warn("Failed to parse question array in reduce", {
        agent: "WrittenQuestionsGraph",
        phase: "reduce_parse_error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const totalQuestionsBefore = allQuestions.length;

  if (totalQuestionsBefore === 0) {
    logger.phaseError("reduce", new Error("No questions generated"), {
      agent: "WrittenQuestionsGraph",
    });
    await callStatusUpdate(state, "failed");
    return {
      finalOutput: [],
      status: "failed",
    };
  }

  const normalizeQuestion = (question: string): string => {
    return question
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[^\w\s]/g, "")
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

  const smartReduceThreshold =
    state.questionCount + Math.max(2, Math.ceil(state.questionCount * 0.25));

  logger.info(
    `Flattened ${totalQuestionsBefore} questions, ${dedupedQuestions.length} remain after heuristic dedupe`,
    {
      agent: "WrittenQuestionsGraph",
      phase: "reduce_after_dedupe",
      totalQuestionsBefore,
      dedupedQuestionCount: dedupedQuestions.length,
      smartReduceThreshold,
    }
  );

  if (dedupedQuestions.length <= state.questionCount) {
    // Heuristic dedupe collapsed near-identical wordings — but the upstream
    // map step usually emitted enough material to cover targetCount unique
    // *items*, just with rephrased duplicates. Pad from the raw pool (skipping
    // exact-duplicate normalized question text) so the final output still
    // reaches the target count.
    const padded: WrittenQuestion[] = [...dedupedQuestions];
    if (padded.length < state.questionCount) {
      const seenIds = new Set(padded.map((q) => q.id));
      for (const candidate of allQuestions) {
        if (padded.length >= state.questionCount) break;
        if (seenIds.has(candidate.id)) continue;
        padded.push(candidate);
        seenIds.add(candidate.id);
      }
    }

    logger.info(
      `Skipping LLM reduce, using ${padded.length} questions directly (${dedupedQuestions.length} after dedupe, padded to ${padded.length} from raw pool of ${allQuestions.length})`,
      {
        agent: "WrittenQuestionsGraph",
        phase: "reduce_skip",
        totalQuestionsExtracted: padded.length,
        dedupedQuestionCount: dedupedQuestions.length,
        rawPoolSize: allQuestions.length,
        targetQuestionCount: state.questionCount,
        reason: "Question pool is already at or below target after heuristic dedupe",
      }
    );

    const result = finalizeQuestions(padded, state, logger);
    return {
      ...result,
      progress: {
        phase: "reduce",
        percentage: 100,
        message: `Completed: ${padded.length} questions generated`,
        itemsGenerated: padded.length,
      },
    };
  }

  if (dedupedQuestions.length <= smartReduceThreshold) {
    const similarQuestions = detectSimilarQuestions(dedupedQuestions);

    if (similarQuestions.length === 0) {
      const skippedSelection = dedupedQuestions.slice(0, state.questionCount);
      logger.info(
        `Skipping smart reduce: ${dedupedQuestions.length} heuristically clean questions are already near target`,
        {
          agent: "WrittenQuestionsGraph",
          phase: "reduce_skip_llm",
          candidateCount: dedupedQuestions.length,
          targetQuestionCount: state.questionCount,
          smartReduceThreshold,
        }
      );

      const result = finalizeQuestions(skippedSelection, state, logger);
      return {
        ...result,
        progress: {
          phase: "reduce",
          percentage: 100,
          message: `Completed: ${skippedSelection.length} questions generated`,
          itemsGenerated: skippedSelection.length,
        },
      };
    }

    logger.info(
      `Keeping smart reduce for ${dedupedQuestions.length} near-target questions because ${similarQuestions.length} duplicate groups remain`,
      {
        agent: "WrittenQuestionsGraph",
        phase: "reduce_keep_llm",
        candidateCount: dedupedQuestions.length,
        duplicateGroups: similarQuestions.length,
        reason: "Near target but heuristic verifier still found overlaps",
      }
    );
  }

  const retryCount = state.reduceRetryCount ?? 0;

  const MAX_QUESTIONS_FOR_LLM = 50;
  let questionsForLLM = dedupedQuestions;

  if (questionsForLLM.length > MAX_QUESTIONS_FOR_LLM) {
    const shuffled = [...questionsForLLM].sort(() => Math.random() - 0.5);
    questionsForLLM = shuffled.slice(0, MAX_QUESTIONS_FOR_LLM);

    logger.info(
      `Randomly sampled ${dedupedQuestions.length} questions down to ${MAX_QUESTIONS_FOR_LLM} before LLM selection`,
      {
        agent: "WrittenQuestionsGraph",
        phase: "reduce_safety_cap",
        totalQuestionsBefore: dedupedQuestions.length,
        sampledDownTo: MAX_QUESTIONS_FOR_LLM,
        targetQuestionCount: state.questionCount,
        reason: "Context window safety cap after heuristic dedupe",
      }
    );
  }

  logger.info(
    `Using smart LLM for intelligent question selection from ${questionsForLLM.length} questions [Attempt ${retryCount + 1}/2]...`,
    {
      agent: "WrittenQuestionsGraph",
      phase: "reduce_llm_selection",
      totalQuestionsBefore,
      dedupedQuestionCount: dedupedQuestions.length,
      questionsForLLM: questionsForLLM.length,
      targetQuestionCount: state.questionCount,
      retryAttempt: retryCount + 1,
      reason: "Using smart reduce after heuristic dedupe because the pool is still large or messy",
    }
  );

  const similarQuestions = detectSimilarQuestions(questionsForLLM);

  if (similarQuestions.length > 0) {
    logger.info(
      `Detected ${similarQuestions.length} potential duplicate groups - LLM will handle merging`,
      {
        agent: "WrittenQuestionsGraph",
        phase: "reduce_similarity_detection",
        duplicateGroups: similarQuestions.length,
        duplicates: similarQuestions.slice(0, 5).map((d) => ({
          type: d.similarity,
          reason: d.reason,
          questions: d.questions.map((q) => q.question.substring(0, 80)),
        })),
      }
    );
  }

  try {
    const reduceModel = (smartLlm as { model?: string }).model ?? env.WRITTEN_QUESTIONS_LLM;
    const structuredLlm = createStructuredLLM(WrittenQuestionsArraySchema, {
      model: reduceModel,
      schemaName: "written_questions_selection",
      reasoningEnabled: true,
    });

    const selectionPrompt = getSelectionPrompt({
      questions: questionsForLLM,
      targetCount: state.questionCount,
      difficulty: state.difficulty,
      questionType: state.questionType,
      focus: state.focus,
    });

    const response: WrittenQuestionsResponse = await invokeWithRetry(
      () =>
        invokeWithTimeout(
          () =>
            (structuredLlm as any).invoke([
              new SystemMessage(REDUCE_SELECT_SYSTEM_PROMPT),
              new HumanMessage(selectionPrompt),
            ]),
          GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
          "WrittenQuestionsReduce"
        ),
      {
        maxAttempts: 2,
        baseDelayMs: 1000,
        onRetry: (attempt, error) => {
          logger.warn(`LLM reduce retry attempt ${attempt}/2`, {
            agent: "WrittenQuestionsGraph",
            phase: "reduce_llm_retry",
            attempt,
            error: error.message,
          });
        },
      },
      "WrittenQuestionsReduce"
    );

    logger.info(`LLM selection completed, selected ${response.questions.length} questions`, {
      agent: "WrittenQuestionsGraph",
      phase: "reduce_llm_success",
      selectedCount: response.questions.length,
    });

    if (response.questions.length === 0) {
      throw new Error("LLM returned zero questions");
    }

    const result = finalizeQuestions(response.questions, state, logger);
    return {
      ...result,
      progress: {
        phase: "reduce",
        percentage: 100,
        message: `Completed: ${response.questions.length} unique questions (target: ${state.questionCount})`,
        itemsGenerated: response.questions.length,
      },
    };
  } catch (error) {
    const errorContext = {
      agent: "WrittenQuestionsGraph",
      phase: "reduce_llm_failed",
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
            }
          : String(error),
    };

    logger.phaseError(
      "reduce_llm_failed",
      error instanceof Error ? error : new Error(String(error)),
      errorContext
    );

    if (retryCount < 1) {
      return new Send("reduce", {
        ...withoutMapOutputs(state),
        reduceRetryCount: retryCount + 1,
      } as any);
    }

    logger.phaseError(
      "reduce_final_fallback",
      new Error("LLM reduce failed after retries, using simple slice fallback"),
      {
        agent: "WrittenQuestionsGraph",
      }
    );

    const fallback = dedupedQuestions.slice(0, state.questionCount);
    const result = finalizeQuestions(fallback, state, logger);
    return {
      ...result,
      progress: {
        phase: "reduce",
        percentage: 100,
        message: `Completed: ${fallback.length} questions (target: ${state.questionCount}, fallback mode)`,
        itemsGenerated: fallback.length,
      },
    };
  }
}
