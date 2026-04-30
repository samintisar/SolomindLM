"use node";

import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import { createLangSmithRunConfig, invokeWithRetry, invokeWithTimeout } from "../_shared/index.js";
import type { JobLogger } from "../_shared/logging.js";
import { withLanguageInstruction } from "../_shared/languageInstruction";

import { FLASHCARD_CONFIG } from "./config.js";
import { detectSimilarFlashcards, groupFlashcardsByTopic } from "./flashcardHeuristics.js";
import { formatFlashcardsAsText } from "./formatFlashcards.js";
import {
  COLLAPSE_SYSTEM_PROMPT,
  FlashcardArraySchema,
  REDUCE_SYSTEM_PROMPT,
  type FlashcardResponse,
} from "./prompts.js";
import type { Flashcard } from "./state.js";
import { createStructuredLLM } from "./structuredLlm.js";

export interface CollapseReduceDeps {
  smartLlm: ChatTogetherAI;
  estimateTokens: (text: string) => number;
  logger: JobLogger;
}

export async function recursiveCollapse(
  outputs: Flashcard[][],
  deps: CollapseReduceDeps,
  topic?: string,
  language?: string
): Promise<Flashcard[][]> {
  const totalTokens = outputs.reduce(
    (sum, flashcards) => sum + deps.estimateTokens(formatFlashcardsAsText(flashcards)),
    0
  );

  if (totalTokens <= FLASHCARD_CONFIG.REDUCE_CHUNK_SIZE_TOKENS) {
    return outputs;
  }

  const targetGroupTokens = FLASHCARD_CONFIG.REDUCE_CHUNK_SIZE_TOKENS * 0.8;
  const collapsed: Flashcard[][] = [];
  let currentGroup: Flashcard[][] = [];
  let currentTokens = 0;

  for (const flashcards of outputs) {
    const tokens = deps.estimateTokens(formatFlashcardsAsText(flashcards));
    if (currentTokens + tokens > targetGroupTokens && currentGroup.length > 0) {
      collapsed.push(await collapseGroup(currentGroup, deps, topic, language));
      currentGroup = [flashcards];
      currentTokens = tokens;
    } else {
      currentGroup.push(flashcards);
      currentTokens += tokens;
    }
  }

  if (currentGroup.length > 0) {
    collapsed.push(await collapseGroup(currentGroup, deps, topic, language));
  }

  return recursiveCollapse(collapsed, deps, topic, language);
}

export async function collapseGroup(
  group: Flashcard[][],
  deps: CollapseReduceDeps,
  topic?: string,
  language?: string
): Promise<Flashcard[]> {
  const allCards: Flashcard[] = [];
  for (const flashcards of group) {
    allCards.push(...flashcards);
  }

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
Condense these flashcards while maintaining quality and diversity:

${flashcardsText}

Return the condensed flashcards as a JSON array with "front" and "back" fields.`;

  const structuredLlm = createStructuredLLM(deps.smartLlm, FlashcardArraySchema);
  const response = (await invokeWithRetry(
    () =>
      invokeWithTimeout(
        () =>
          structuredLlm.invoke(
            [new SystemMessage(withLanguageInstruction(COLLAPSE_SYSTEM_PROMPT, language)), new HumanMessage(prompt)],
            createLangSmithRunConfig({
              runName: "FlashcardGraph.CollapseGroup",
              tags: ["agent", "flashcard", "collapse"],
              metadata: {
                inputCount: group.length,
                mergedCardCount: allCards.length,
              },
            }) as unknown as Record<string, unknown>
          ),
        FLASHCARD_CONFIG.REDUCE_TIMEOUT_MS,
        "FlashcardCollapseGroup"
      ),
    {
      maxAttempts: 2,
      baseDelayMs: 1000,
    },
    "FlashcardCollapseGroup"
  )) as FlashcardResponse;

  return response.flashcards;
}

export async function refineFlashcardSelection(
  flashcards: Flashcard[],
  targetCount: number,
  difficulty: string,
  deps: CollapseReduceDeps,
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

TOPIC DIVERSITY:
Additionally, select flashcards from DIFFERENT topics. Do NOT select more than 3 cards from any single topic.
If there are 6+ topics available, select 1-3 cards from each topic.
Example: If you need 20 cards and have 5 topics, select 4 from each topic

From the ${flashcards.length} flashcards below, select approximately ${targetCount}.
${topic ? `User preference: ${topic} (but still maintain diversity)` : ""}

Available flashcards:
${flashcardsText}

Return the complete selected flashcards as a JSON array. For each flashcard, include a "topic" field that categorizes the card (e.g., "Definitions", "Processes", "Timeline", "Concepts", etc.). This helps ensure topic diversity.`;

  const structuredLlm = createStructuredLLM(deps.smartLlm, FlashcardArraySchema);
  const response = await invokeWithRetry(
    () =>
      invokeWithTimeout(
        () =>
          structuredLlm.invoke(
            [new SystemMessage(withLanguageInstruction(REDUCE_SYSTEM_PROMPT, language)), new HumanMessage(prompt)],
            createLangSmithRunConfig({
              runName: "FlashcardGraph.RefineSelection",
              tags: ["agent", "flashcard", "reduce"],
              metadata: {
                targetCount,
                difficulty,
                topic: topic || "none",
                candidateCount: flashcards.length,
              },
            }) as unknown as Record<string, unknown>
          ),
        FLASHCARD_CONFIG.REDUCE_TIMEOUT_MS,
        "FlashcardRefineSelection"
      ),
    {
      maxAttempts: 2,
      baseDelayMs: 1000,
    },
    "FlashcardRefineSelection"
  );

  const selected = (response as FlashcardResponse).flashcards;

  deps.logger.info(`Refine selection complete: ${selected.length} cards`, {
    agent: "FlashcardGraph",
    phase: "refine_selection_complete",
    selectedCount: selected.length,
  });

  const topicGroups = groupFlashcardsByTopic(selected);
  deps.logger.info("Topic distribution after refine", {
    agent: "FlashcardGraph",
    phase: "refine_topic_distribution",
    topicDistribution: topicGroups,
  });

  if (selected.length === 0) {
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
