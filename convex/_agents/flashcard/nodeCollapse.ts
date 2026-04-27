"use node";

import { clearStateKeys, withoutMapOutputs } from "../_shared/index.js";

import { FLASHCARD_CONFIG } from "./config.js";
import { formatFlashcardsAsText } from "./formatFlashcards.js";
import { callStatusUpdate } from "./nodeSplit.js";
import type { Flashcard, OverallStateType } from "./state.js";

export interface CollapseNodeDeps {
  estimateTokens: (text: string) => number;
  recursiveCollapse: (outputs: Flashcard[][], topic?: string) => Promise<Flashcard[][]>;
}

export async function collapse(
  state: OverallStateType,
  deps: CollapseNodeDeps
): Promise<Partial<OverallStateType>> {
  console.log(`\n${"=".repeat(80)}`);
  console.log("[FlashcardGraph] ===== COLLAPSE PHASE =====");
  console.log("=".repeat(80));

  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        phase: "collapse",
        mapOutputsReceived: state.mapOutputs.length,
        mapOutputsDetails: state.mapOutputs.map((output, idx) => {
          const cardCount = output.length;
          const preview = output.length > 0 ? `${output[0].front.substring(0, 50)}...` : "empty";
          return {
            index: idx,
            cards: cardCount,
            preview,
          };
        }),
      },
      null,
      2
    )
  );

  if (!state.mapOutputs || state.mapOutputs.length === 0) {
    console.error("[FlashcardGraph] Collapse: ERROR - No mapOutputs received!");
    await callStatusUpdate(state, "collapsing");
    return {
      collapsedOutputs: [],
      status: "reducing",
      progress: {
        phase: "collapse",
        percentage: 60,
        message: "No chunks to process",
        chunksCompleted: 0,
        totalChunks: state.progress?.totalChunks || 0,
      },
    };
  }

  const chunksCompleted = state.mapOutputs.length;
  const totalChunks = state.progress?.totalChunks || state.chunks.length || chunksCompleted;
  const mapPhaseProgress = Math.min((chunksCompleted / Math.max(totalChunks, 1)) * 50, 50);
  const percentage = Math.min(10 + mapPhaseProgress + 10, 70);

  await callStatusUpdate(state, "collapsing");

  const totalTokens = state.mapOutputs.reduce(
    (sum, flashcards) => sum + deps.estimateTokens(formatFlashcardsAsText(flashcards)),
    0
  );

  console.log(
    `[FlashcardGraph] Total tokens: ${totalTokens}, Reduce chunk size: ${FLASHCARD_CONFIG.REDUCE_CHUNK_SIZE_TOKENS} tokens`
  );

  if (totalTokens <= FLASHCARD_CONFIG.REDUCE_CHUNK_SIZE_TOKENS) {
    console.log(
      "[FlashcardGraph] Collapse: skipping recursive collapse, using mapOutputs directly"
    );

    const totalCards = state.mapOutputs.reduce((sum, group) => sum + group.length, 0);
    const estimatedSize = totalCards * 200;
    console.log(
      `[FlashcardGraph] Collapse: freeing ~${(estimatedSize / 1024).toFixed(2)} KB from mapOutputs`
    );

    return {
      ...withoutMapOutputs(state),
      collapsedOutputs: state.mapOutputs,
      status: "reducing",
      ...clearStateKeys<OverallStateType>(["mapOutputs"]),
      progress: {
        phase: "collapse",
        percentage,
        message: `Collected ${chunksCompleted} chunk outputs`,
        chunksCompleted,
        totalChunks,
      },
    };
  }

  console.log("[FlashcardGraph] Collapse: performing recursive collapse");
  const collapsed = await deps.recursiveCollapse(state.mapOutputs, state.topic);

  const totalCards = state.mapOutputs.reduce((sum, group) => sum + group.length, 0);
  const estimatedSize = totalCards * 200;
  console.log(
    `[FlashcardGraph] Collapse: freeing ~${(estimatedSize / 1024).toFixed(2)} KB from mapOutputs`
  );

  return {
    ...withoutMapOutputs(state),
    collapsedOutputs: collapsed,
    status: "reducing",
    ...clearStateKeys<OverallStateType>(["mapOutputs"]),
    progress: {
      phase: "collapse",
      percentage,
      message: `Collapsed ${chunksCompleted} outputs into ${collapsed.length}`,
      chunksCompleted,
      totalChunks,
    },
  };
}
