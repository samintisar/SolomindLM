"use node";

import { Send } from "@langchain/langgraph";
import { selectStudioMapBatches } from "../_shared/studioExecutionMode.js";
import { countTokens } from "../_shared/tokenizer.js";
import { packChunks, validateChunks } from "./chunkHelpers.js";
import { GRAPH_CONFIG } from "./config.js";
import type { OverallStateType } from "./state.js";

export function routeToMap(state: OverallStateType): Send[] | "collapse" | "skip_map" {
  console.log("\n" + "=".repeat(80));
  console.log("[FlashcardGraph] ===== ROUTE TO MAP PHASE =====");
  console.log("=".repeat(80));

  if (state.chunks.length === 0) {
    console.warn("[FlashcardGraph] No chunks to process, routing to collapse");
    return "collapse";
  }

  const validatedChunks = validateChunks(state.chunks);
  const { mode, batches: packedChunks } = selectStudioMapBatches({
    documentCount: state.documentIds?.length || 0,
    chunks: validatedChunks,
    estimateTokens: countTokens,
    pack: (chunks) => packChunks(chunks, GRAPH_CONFIG.MAP_CHUNK_SIZE_TOKENS),
  });

  if (packedChunks.length === 0) {
    console.warn("[FlashcardGraph] No map batches after skip-map planning, routing to collapse");
    return "collapse";
  }

  const MIN_CARDS_PER_CHUNK = 2;
  const BUFFER_MULTIPLIER = 1.5;
  const MAX_CARDS_PER_CHUNK = 30;
  const cardsPerChunk = Math.max(
    MIN_CARDS_PER_CHUNK,
    Math.min(
      MAX_CARDS_PER_CHUNK,
      Math.ceil((state.cardCount / packedChunks.length) * BUFFER_MULTIPLIER)
    )
  );

  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        phase: "route_to_map",
        originalChunks: state.chunks.length,
        validatedChunks: validatedChunks.length,
        packedChunks: packedChunks.length,
        executionMode: mode,
        targetCardCount: state.cardCount,
        cardsPerChunk,
        difficulty: state.difficulty,
        topic: state.topic,
      },
      null,
      2
    )
  );

  if (mode === "single_pass") {
    console.log("[FlashcardGraph] Execution mode single_pass: routing directly to skip_map");
    return "skip_map";
  }

  console.log(
    `[FlashcardGraph] Creating ${packedChunks.length} parallel map tasks (~${cardsPerChunk} cards/chunk)`
  );

  return packedChunks.map((chunk, idx) => {
    const preview = chunk.substring(0, 100).replace(/\n/g, " ");
    console.log(`  [Task ${idx + 1}/${packedChunks.length}] ${preview}... (${chunk.length} chars)`);
    return new Send("map_process", {
      chunk,
      chunkIndex: idx,
      cardCount: state.cardCount,
      difficulty: state.difficulty,
      topic: state.topic,
      cardsPerChunk,
    });
  });
}
