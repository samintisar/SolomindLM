"use node"

import {
  clearStateKeys,
  logBanner,
  logError,
  logInfo,
  logPhaseStart,
  logWarn,
  validateFlashcards,
} from '../_shared/index.js';

import {
  groupFlashcardsByTopic,
  heuristicDedupeFlashcards,
  validateSelfContained,
} from './flashcardHeuristics.js';
import { callStatusUpdate } from './nodeSplit.js';
import type { Flashcard, OverallStateType } from './state.js';

export interface ReduceNodeDeps {
  refineFlashcardSelection: (
    flashcards: Flashcard[],
    targetCount: number,
    difficulty: string,
    topic?: string
  ) => Promise<Flashcard[]>;
}

function flattenCollapsedOutputs(outputs: Flashcard[][]): Flashcard[] {
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

  logInfo({
    agent: 'FlashcardGraph',
    phase: 'flatten_collapsed_outputs_complete',
    extractedCount: allCards.length,
    failedValidationCount,
  }, `Flattened ${allCards.length} flashcards (${failedValidationCount} failed validation)`);

  return allCards;
}

export async function reduceFlashcards(
  state: OverallStateType,
  deps: ReduceNodeDeps
): Promise<Partial<OverallStateType>> {
  await callStatusUpdate(state, 'reducing');

  logPhaseStart({
    agent: 'FlashcardGraph',
    phase: 'reduce',
    collapsedOutputsCount: state.collapsedOutputs.length,
    targetCardCount: state.cardCount,
    difficulty: state.difficulty,
    topic: state.topic || 'none',
  });

  state.collapsedOutputs.forEach((flashcards, idx) => {
    const cardCount = flashcards.length;
    const preview = flashcards.length > 0
      ? `${flashcards[0].front.substring(0, 50)}...`
      : 'empty';

    logInfo({
      agent: 'FlashcardGraph',
      phase: 'reduce_analyze_output',
      outputIndex: idx,
      outputCount: state.collapsedOutputs.length,
      cardCount,
      preview,
    });
  });

  const parsedFlashcards = flattenCollapsedOutputs(state.collapsedOutputs);

  logInfo({
    agent: 'FlashcardGraph',
    phase: 'reduce_after_flatten',
    initialCardCount: parsedFlashcards.length,
  }, `Flattened ${parsedFlashcards.length} flashcards`);

  if (parsedFlashcards.length === 0) {
    const totalInputs = state.collapsedOutputs.reduce((sum, flashcards) => sum + flashcards.length, 0);

    logError({
      agent: 'FlashcardGraph',
      phase: 'reduce',
      error: 'No flashcards parsed',
      totalInputs,
    }, `CRITICAL: No flashcards parsed despite ${totalInputs} input cards!`);
    await callStatusUpdate(state, 'failed');
    return {
      ...state,
      finalOutput: [],
      status: 'failed',
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
    logInfo({
      agent: 'FlashcardGraph',
      phase: 'reduce_skip_llm',
      originalCount: parsedFlashcards.length,
      dedupedCount: dedupedFlashcards.length,
      targetCardCount: state.cardCount,
      duplicatesRemoved,
      nearTargetUpperBound,
    }, `Skipping smart reduce: ${dedupedFlashcards.length} deduped cards already near target ${state.cardCount}`);
  } else {
    finalFlashcards = await deps.refineFlashcardSelection(
      dedupedFlashcards,
      state.cardCount,
      state.difficulty,
      state.topic
    );

    logInfo({
      agent: 'FlashcardGraph',
      phase: 'reduce_after_refinement',
      refinedCount: finalFlashcards.length,
      originalCount: parsedFlashcards.length,
      dedupedCount: dedupedFlashcards.length,
    }, `Smart refinement complete: ${parsedFlashcards.length} → ${dedupedFlashcards.length} → ${finalFlashcards.length} cards`);
  }

  const topicDistribution = groupFlashcardsByTopic(finalFlashcards);
  logInfo({
    agent: 'FlashcardGraph',
    phase: 'reduce_topic_distribution',
    topicDistribution,
  }, `Final topic distribution across ${finalFlashcards.length} cards`);

  logInfo({
    agent: 'FlashcardGraph',
    phase: 'reduce_flashcards_detail',
    flashcards: finalFlashcards.map((card, idx) => ({
      index: idx + 1,
      front: card.front,
      backLength: card.back.length,
      backPreview: card.back.substring(0, 100),
    })),
  });

  const validation = validateFlashcards(JSON.stringify(finalFlashcards), state.cardCount);
  logInfo({
    agent: 'FlashcardGraph',
    phase: 'reduce_validation',
    validation: {
      isValid: validation.isValid,
      warnings: validation.warnings,
      score: validation.score,
    },
  });

  logInfo({
    agent: 'FlashcardGraph',
    phase: 'reduce',
    flashcardsGenerated: finalFlashcards.length,
    targetCardCount: state.cardCount,
  }, `Generated ${finalFlashcards.length} flashcards (target: ${state.cardCount})`);

  if (finalFlashcards.length !== state.cardCount) {
    logWarn({
      agent: 'FlashcardGraph',
      phase: 'reduce_count_mismatch',
      generatedCount: finalFlashcards.length,
      targetCount: state.cardCount,
    }, `Returned ${finalFlashcards.length} cards, target was ${state.cardCount}. Accepting final result.`);
  }

  logInfo({
    agent: 'FlashcardGraph',
    phase: 'reduce_final',
    finalFlashcardCount: finalFlashcards.length,
    finalFlashcards: finalFlashcards.map((card, idx) => ({
      index: idx + 1,
      front: card.front,
      backLength: card.back.length,
      backPreview: card.back.substring(0, 100),
    })),
  });

  logBanner(
    {
      agent: 'FlashcardGraph',
      phase: 'generation_complete',
      finalFlashcardCount: finalFlashcards.length,
      targetCardCount: state.cardCount,
    },
    'GENERATION COMPLETE'
  );

  const totalCards = state.collapsedOutputs.reduce((sum, group) => sum + group.length, 0);
  const estimatedSize = totalCards * 200;
  const chunksSize = (state.chunks || []).reduce((sum, s) => sum + s.length * 2, 0);
  console.log(`[FlashcardGraph] Reduce: freeing ~${((estimatedSize + chunksSize) / 1024).toFixed(2)} KB from intermediate data`);

  return {
    ...state,
    finalOutput: finalFlashcards,
    status: 'completed',
    ...clearStateKeys<OverallStateType>(['collapsedOutputs', 'chunks']),
    progress: {
      phase: 'reduce',
      percentage: 100,
      message: `Completed: ${finalFlashcards.length} flashcards generated`,
      itemsGenerated: finalFlashcards.length,
    },
  };
}
