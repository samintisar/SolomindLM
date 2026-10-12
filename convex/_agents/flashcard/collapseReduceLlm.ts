"use node";

import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { env } from "../../_lib/env.js";
import { planCollapseGroups, shouldStopCollapsing } from "../../studio/_job/collapsePlan";
import { invokeWithinBudget } from "../../studio/_job/invokeStudioLlm";
import type { JobDeadline } from "../../studio/_job/jobDeadline";
import { allWithConcurrency } from "../_shared/concurrency.js";
import { withLanguageInstruction } from "../_shared/languageInstruction";
import type { JobLogger } from "../_shared/logging.js";
import type { TokenUsage } from "../_shared/usageAggregate.js";
import { FLASHCARD_CONFIG } from "./config.js";
import {
  detectSimilarFlashcards,
  groupFlashcardsByTopic,
  isUsableFlashcard,
} from "./flashcardHeuristics.js";
import { formatFlashcardsAsText } from "./formatFlashcards.js";
import {
  ANSWER_NOT_ON_FRONT_RULES,
  COLLAPSE_SYSTEM_PROMPT,
  type Flashcard,
  FlashcardArraySchema,
  type FlashcardResponse,
  REDUCE_SYSTEM_PROMPT,
} from "./prompts.js";
import { createStructuredLLM } from "./structuredLlm.js";

export interface CollapseReduceDeps {
  smartLlm: ChatTogetherAI;
  estimateTokens: (text: string) => number;
  logger: JobLogger;
  onUsage?: (usage: TokenUsage) => void;
  /** Wall-clock budget for the whole finalize action; collapse rounds stop before it runs out. */
  deadline: JobDeadline;
}

/**
 * Merges map outputs round by round until they are small enough to refine.
 *
 * Every collapse group holds at least two outputs, so each round at least halves
 * the output count even when the LLM drops no cards; collapse calls only get the
 * time left after `REFINE_RESERVE_MS`, and a group that fails or runs out of time
 * passes its cards through unchanged.
 */
export async function recursiveCollapse(
  outputs: Flashcard[][],
  deps: CollapseReduceDeps,
  topic?: string,
  language?: string
): Promise<Flashcard[][]> {
  const estimateCards = (flashcards: Flashcard[]) =>
    deps.estimateTokens(formatFlashcardsAsText(flashcards));

  if (shouldStopCollapsing(outputs, FLASHCARD_CONFIG.REDUCE_CHUNK_SIZE_TOKENS, estimateCards)) {
    return outputs;
  }

  const collapseCallBudgetMs = () =>
    deps.deadline.stepTimeoutMs(
      FLASHCARD_CONFIG.REDUCE_TIMEOUT_MS,
      FLASHCARD_CONFIG.REFINE_RESERVE_MS
    );

  if (collapseCallBudgetMs() < FLASHCARD_CONFIG.MIN_COLLAPSE_CALL_MS) {
    deps.logger.info(`Out of collapse time budget, refining ${outputs.length} outputs as-is`, {
      agent: "FlashcardGraph",
      phase: "collapse_budget_spent",
      outputCount: outputs.length,
    });
    return outputs;
  }

  const groups = planCollapseGroups(
    outputs,
    FLASHCARD_CONFIG.REDUCE_CHUNK_SIZE_TOKENS,
    estimateCards
  );

  const collapsed = await allWithConcurrency(
    groups.map((group, idx) => async () => {
      const merged = group.flat();
      if (group.length === 1) {
        return merged; // Trailing singleton: nothing to merge
      }
      // Groups queued behind earlier waves start later, so re-check the budget
      // here instead of firing a call that would be abandoned almost at once.
      const timeoutMs = collapseCallBudgetMs();
      if (timeoutMs < FLASHCARD_CONFIG.MIN_COLLAPSE_CALL_MS) {
        deps.logger.info(`Collapse group ${idx} skipped: out of time budget`, {
          agent: "FlashcardGraph",
          phase: "collapse_group_skipped",
          groupIndex: idx,
        });
        return merged;
      }
      try {
        return await collapseGroup(group, deps, timeoutMs, topic, language);
      } catch (error) {
        deps.logger.warn(`Collapse group ${idx} failed, keeping its cards uncollapsed`, {
          agent: "FlashcardGraph",
          phase: "collapse_group_failed",
          groupIndex: idx,
          error: error instanceof Error ? error.message : String(error),
        });
        return merged;
      }
    }),
    FLASHCARD_CONFIG.COLLAPSE_CONCURRENCY
  );

  return recursiveCollapse(collapsed, deps, topic, language);
}

/** One collapse LLM call over `group`, bounded (retries included) by `timeoutMs`. */
export async function collapseGroup(
  group: Flashcard[][],
  deps: CollapseReduceDeps,
  timeoutMs: number,
  topic?: string,
  language?: string
): Promise<Flashcard[]> {
  const allCards = group.flat();

  deps.logger.info(`Collapsing ${group.length} outputs (${allCards.length} cards)`, {
    agent: "FlashcardGraph",
    phase: "collapse_group",
    inputCount: group.length,
    mergedCardCount: allCards.length,
  });

  if (allCards.length <= 30) {
    return allCards;
  }

  const flashcardsText = formatFlashcardsAsText(allCards);
  const topicGuidance = topic
    ? `\n\nTopic Focus: ${topic} — prioritize cards aligned with this topic while maintaining diversity.`
    : "";

  const prompt = `You are consolidating flashcard sets. Your task is to:
1. Remove duplicate or highly similar flashcards
2. Keep the highest quality, most diverse set
3. Target approximately ${Math.floor(allCards.length * 0.7)} flashcards (remove ~30%)
${topicGuidance}

${ANSWER_NOT_ON_FRONT_RULES}

Condense these flashcards while maintaining quality and diversity:

${flashcardsText}

Return the condensed flashcards as a JSON array with "front" and "back" fields.`;

  const reduceModel = (deps.smartLlm as { model?: string }).model ?? env.SMART_LLM;
  const structuredLlm = createStructuredLLM(FlashcardArraySchema, {
    model: reduceModel,
    reasoningEnabled: true,
    maxTokens: FLASHCARD_CONFIG.REDUCE_MAX_TOKENS,
    onUsage: deps.onUsage,
  });
  const response = (await invokeWithinBudget({
    invoke: () =>
      structuredLlm.invoke([
        new SystemMessage(withLanguageInstruction(COLLAPSE_SYSTEM_PROMPT, language)),
        new HumanMessage(prompt),
      ]),
    timeoutMs,
    phaseLabel: "FlashcardCollapseGroup",
    retry: { maxAttempts: 2 },
  })) as FlashcardResponse;

  // A collapse may only shrink a group; an LLM that pads the set is cut back, and
  // one that returns nothing usable leaves the group's cards as they were.
  const usable = response.flashcards.filter(isUsableFlashcard).slice(0, allCards.length);
  if (usable.length === 0) {
    deps.logger.warn("Collapse returned no usable cards, keeping the group uncollapsed", {
      agent: "FlashcardGraph",
      phase: "collapse_group_empty",
      inputCount: allCards.length,
      returnedCount: response.flashcards.length,
    });
    return allCards;
  }
  return usable;
}

export async function refineFlashcardSelection(
  flashcards: Flashcard[],
  targetCount: number,
  difficulty: string,
  deps: CollapseReduceDeps,
  timeoutMs: number,
  topic?: string,
  language?: string
): Promise<Flashcard[]> {
  deps.logger.info(`Selecting ${targetCount} best cards from ${flashcards.length}`, {
    agent: "FlashcardGraph",
    phase: "refine_selection",
    totalFlashcards: flashcards.length,
    targetCount,
  });

  const similarFlashcards = await detectSimilarFlashcards(flashcards);

  if (similarFlashcards.length > 0) {
    deps.logger.info(
      `Detected ${similarFlashcards.length} potential duplicate groups - LLM will handle merging`,
      {
        agent: "FlashcardGraph",
        phase: "refine_similarity_detection",
        duplicateGroups: similarFlashcards.length,
        duplicates: similarFlashcards.slice(0, 5).map((d) => ({
          type: d.similarity,
          reason: d.reason,
          flashcards: d.flashcards.map((f) => ({
            front: f.front.substring(0, 60),
            back: f.back.substring(0, 60),
          })),
        })),
      }
    );
  }

  const flashcardsText = formatFlashcardsAsText(flashcards);
  const prompt = `You are an expert educator selecting and refining flashcards for a study set.

CRITICAL REQUIREMENTS:
- Select approximately ${targetCount} flashcards (flexible: ±${Math.ceil(targetCount * 0.2)} is acceptable)
- IDENTIFY AND MERGE similar or duplicate flashcards before selecting
- Quality over quantity: Better to have ${Math.ceil(targetCount * 0.8)} unique cards than ${targetCount} with duplicates
- Your goal is MAXIMUM SEMANTIC DIVERSITY - each card should cover a distinct concept

SIMILARITY DETECTION GUIDELINES:
Flashcards are considered similar if they:
- Test the same definition or concept (e.g., "Define X" on front, "What is X" on front)
- Have the same answer despite different question phrasing
- Cover overlapping content that could be combined into one card

MERGING STRATEGY:
When you find similar flashcards:
- Combine the best elements from each version (clearest question, most complete answer)
- Create a single, clearer flashcard
- Ensure the merged card is self-contained
- Keep the most comprehensive explanation or examples

${ANSWER_NOT_ON_FRONT_RULES}

TOPIC DIVERSITY:
Additionally, select flashcards from DIFFERENT topics. Do NOT select more than 3 cards from any single topic.
If there are 6+ topics available, select 1-3 cards from each topic.
Example: If you need 20 cards and have 5 topics, select 4 from each topic

From the ${flashcards.length} flashcards below, select approximately ${targetCount}.
${topic ? `User preference: ${topic} (but still maintain diversity)` : ""}

Available flashcards:
${flashcardsText}

Return the complete selected flashcards as a JSON array. For each flashcard, include a "topic" field that categorizes the card (e.g., "Definitions", "Processes", "Timeline", "Concepts", etc.). This helps ensure topic diversity.`;

  const reduceModel = (deps.smartLlm as { model?: string }).model ?? env.SMART_LLM;
  const structuredLlm = createStructuredLLM(FlashcardArraySchema, {
    model: reduceModel,
    reasoningEnabled: true,
    maxTokens: FLASHCARD_CONFIG.REDUCE_MAX_TOKENS,
    onUsage: deps.onUsage,
  });
  const response = await invokeWithinBudget({
    invoke: () =>
      structuredLlm.invoke([
        new SystemMessage(withLanguageInstruction(REDUCE_SYSTEM_PROMPT, language)),
        new HumanMessage(prompt),
      ]),
    timeoutMs,
    phaseLabel: "FlashcardRefineSelection",
    retry: { maxAttempts: 2 },
  });

  // Refining rewrites and merges cards, which can reintroduce answer leaks; drop
  // them here so the backfill below replaces them with already-validated cards.
  const refined = (response as FlashcardResponse).flashcards;
  const selected = refined.filter(isUsableFlashcard);

  deps.logger.info(`Refine selection complete: ${selected.length} cards`, {
    agent: "FlashcardGraph",
    phase: "refine_selection_complete",
    selectedCount: selected.length,
    rejectedCount: refined.length - selected.length,
  });

  const topicGroups = groupFlashcardsByTopic(selected);
  deps.logger.info("Topic distribution after refine", {
    agent: "FlashcardGraph",
    phase: "refine_topic_distribution",
    topicDistribution: topicGroups,
  });

  if (refined.length === 0) {
    deps.logger.phaseError(
      "refine_selection",
      new Error("LLM returned empty selection - this should not happen with structured output"),
      {
        agent: "FlashcardGraph",
        issue: "llm_returned_empty",
        inputCount: flashcards.length,
        targetCount,
      }
    );
    return [];
  }

  if (selected.length > targetCount) {
    deps.logger.info(`Truncating to ${targetCount} (LLM returned more than requested)`, {
      agent: "FlashcardGraph",
      phase: "refine_selection_truncate",
      selectedCount: selected.length,
      targetCount,
    });
    return selected.slice(0, targetCount);
  }

  if (selected.length < targetCount) {
    const remaining = flashcards.filter(
      (f) => !selected.some((s) => s.front === f.front && s.back === f.back)
    );
    const needed = targetCount - selected.length;

    if (remaining.length > 0) {
      deps.logger.info(`Filling ${needed} more from remaining ${remaining.length}`, {
        agent: "FlashcardGraph",
        phase: "refine_selection_fill",
        selectedCount: selected.length,
        targetCount,
      });
      return [...selected, ...remaining.slice(0, needed)];
    }
  }

  return selected;
}
