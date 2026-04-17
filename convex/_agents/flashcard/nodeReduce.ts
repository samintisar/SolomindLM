"use node";

import { clearStateKeys, validateFlashcards } from "../_shared/index.js";
import { createAgentGraphLogger, type JobLogger } from "../_shared/logging.js";

import {
  groupFlashcardsByTopic,
  heuristicDedupeFlashcards,
  validateSelfContained,
} from "./flashcardHeuristics.js";
import { callStatusUpdate } from "./nodeSplit.js";
import type { Flashcard, OverallStateType } from "./state.js";

export interface ReduceNodeDeps {
  refineFlashcardSelection: (
    flashcards: Flashcard[],
    targetCount: number,
    difficulty: string,
    topic?: string
  ) => Promise<Flashcard[]>;
}

function flattenCollapsedOutputs(outputs: Flashcard[][], logger: JobLogger): Flashcard[] {
  const allCards: Flashcard[] = [];
  let failedValidationCount = 0;

  for (const flashcards of outputs) {
    for (const card of flashcards) {
      if (card.front && card.back && validateSelfContained(card)) {
        allCards.push(card);
      } else {
        failedValidationCount++;
      }
    }
  }

  logger.info(
    `Flattened ${allCards.length} flashcards (${failedValidationCount} failed validation)`,
    {
      agent: "FlashcardGraph",
      phase: "flatten_collapsed_outputs_complete",
      extractedCount: allCards.length,
      failedValidationCount,
    }
  );

  return allCards;
}

export async function reduceFlashcards(
  state: OverallStateType,
  deps: ReduceNodeDeps
): Promise<Partial<OverallStateType>> {
  await callStatusUpdate(state, "reducing");

  const logger = createAgentGraphLogger("FlashcardGraph", "flashcard");

  logger.phaseStart("reduce", {
    agent: "FlashcardGraph",
    collapsedOutputsCount: state.collapsedOutputs.length,
    targetCardCount: state.cardCount,
    difficulty: state.difficulty,
    topic: state.topic || "none",
  });

  state.collapsedOutputs.forEach((flashcards, idx) => {
    const cardCount = flashcards.length;
    const preview = flashcards.length > 0 ? `${flashcards[0].front.substring(0, 50)}...` : "empty";

    logger.info(
      `Collapsed output ${idx + 1}/${state.collapsedOutputs.length}: ${cardCount} cards — ${preview}`,
      {
        agent: "FlashcardGraph",
        phase: "reduce_analyze_output",
        outputIndex: idx,
        outputCount: state.collapsedOutputs.length,
        cardCount,
        preview,
      }
    );
  });

  const parsedFlashcards = flattenCollapsedOutputs(state.collapsedOutputs, logger);

  logger.info(`Flattened ${parsedFlashcards.length} flashcards`, {
    agent: "FlashcardGraph",
    phase: "reduce_after_flatten",
    initialCardCount: parsedFlashcards.length,
  });

  if (parsedFlashcards.length === 0) {
    const totalInputs = state.collapsedOutputs.reduce(
      (sum, flashcards) => sum + flashcards.length,
      0
    );

    logger.phaseError(
      "reduce",
      new Error(`CRITICAL: No flashcards parsed despite ${totalInputs} input cards`),
      { agent: "FlashcardGraph", totalInputs }
    );
    await callStatusUpdate(state, "failed");
    return {
      ...state,
      finalOutput: [],
      status: "failed",
    };
  }

  const { dedupedFlashcards, duplicatesRemoved } = heuristicDedupeFlashcards(parsedFlashcards);
  const nearTargetUpperBound = Math.max(state.cardCount + 2, Math.ceil(state.cardCount * 1.2));
  const shouldSkipSmartSelection =
    dedupedFlashcards.length <= nearTargetUpperBound &&
    (dedupedFlashcards.length <= state.cardCount || duplicatesRemoved <= 1);

  let finalFlashcards: Flashcard[];

  if (shouldSkipSmartSelection) {
    finalFlashcards = dedupedFlashcards.slice(0, state.cardCount);
    logger.info(
      `Skipping smart reduce: ${dedupedFlashcards.length} deduped cards already near target ${state.cardCount}`,
      {
        agent: "FlashcardGraph",
        phase: "reduce_skip_llm",
        originalCount: parsedFlashcards.length,
        dedupedCount: dedupedFlashcards.length,
        targetCardCount: state.cardCount,
        duplicatesRemoved,
        nearTargetUpperBound,
      }
    );
  } else {
    finalFlashcards = await deps.refineFlashcardSelection(
      dedupedFlashcards,
      state.cardCount,
      state.difficulty,
      state.topic
    );

    logger.info(
      `Smart refinement complete: ${parsedFlashcards.length} → ${dedupedFlashcards.length} → ${finalFlashcards.length} cards`,
      {
        agent: "FlashcardGraph",
        phase: "reduce_after_refinement",
        refinedCount: finalFlashcards.length,
        originalCount: parsedFlashcards.length,
        dedupedCount: dedupedFlashcards.length,
      }
    );
  }

  const topicDistribution = groupFlashcardsByTopic(finalFlashcards);
  logger.info(`Final topic distribution across ${finalFlashcards.length} cards`, {
    agent: "FlashcardGraph",
    phase: "reduce_topic_distribution",
    topicDistribution,
  });

  logger.info("Flashcard detail snapshot", {
    agent: "FlashcardGraph",
    phase: "reduce_flashcards_detail",
    flashcards: finalFlashcards.map((card, idx) => ({
      index: idx + 1,
      front: card.front,
      backLength: card.back.length,
      backPreview: card.back.substring(0, 100),
    })),
  });

  const validation = validateFlashcards(JSON.stringify(finalFlashcards), state.cardCount);
  logger.info("Validation result", {
    agent: "FlashcardGraph",
    phase: "reduce_validation",
    validation: {
      isValid: validation.isValid,
      warnings: validation.warnings,
      score: validation.score,
    },
  });

  logger.info(`Generated ${finalFlashcards.length} flashcards (target: ${state.cardCount})`, {
    agent: "FlashcardGraph",
    phase: "reduce",
    flashcardsGenerated: finalFlashcards.length,
    targetCardCount: state.cardCount,
  });

  if (finalFlashcards.length !== state.cardCount) {
    logger.warn(
      `Returned ${finalFlashcards.length} cards, target was ${state.cardCount}. Accepting final result.`,
      {
        agent: "FlashcardGraph",
        phase: "reduce_count_mismatch",
        generatedCount: finalFlashcards.length,
        targetCount: state.cardCount,
      }
    );
  }

  logger.info("Reduce final snapshot", {
    agent: "FlashcardGraph",
    phase: "reduce_final",
    finalFlashcardCount: finalFlashcards.length,
    finalFlashcards: finalFlashcards.map((card, idx) => ({
      index: idx + 1,
      front: card.front,
      backLength: card.back.length,
      backPreview: card.back.substring(0, 100),
    })),
  });

  logger.info("GENERATION COMPLETE", {
    agent: "FlashcardGraph",
    phase: "generation_complete",
    finalFlashcardCount: finalFlashcards.length,
    targetCardCount: state.cardCount,
    milestone: true,
  });

  const totalCards = state.collapsedOutputs.reduce((sum, group) => sum + group.length, 0);
  const estimatedSize = totalCards * 200;
  const chunksSize = (state.chunks || []).reduce((sum, s) => sum + s.length * 2, 0);
  console.log(
    `[FlashcardGraph] Reduce: freeing ~${((estimatedSize + chunksSize) / 1024).toFixed(2)} KB from intermediate data`
  );

  return {
    ...state,
    finalOutput: finalFlashcards,
    status: "completed",
    ...clearStateKeys<OverallStateType>(["collapsedOutputs", "chunks"]),
    progress: {
      phase: "reduce",
      percentage: 100,
      message: `Completed: ${finalFlashcards.length} flashcards generated`,
      itemsGenerated: finalFlashcards.length,
    },
  };
}
