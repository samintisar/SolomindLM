"use node";

import { Send } from "@langchain/langgraph";

import { GRAPH_CONFIG, SLIDE_COUNT_MAP } from "./config.js";
import { packChunks, validateChunks } from "./chunkHelpers.js";
import type { OverallStateType } from "./state.js";

export function routeToMap(
  state: OverallStateType,
  estimateTokens: (text: string) => number
): Send[] | "collapse" {
  console.log("\n" + "=".repeat(80));
  console.log("[SlideDeckGraph] ===== ROUTE TO MAP PHASE =====");
  console.log("=".repeat(80));

  if (state.chunks.length === 0) {
    console.warn("[SlideDeckGraph] No chunks to process, routing to collapse");
    return "collapse";
  }

  const validatedChunks = validateChunks(state.chunks);
  const packedChunks = packChunks(validatedChunks, GRAPH_CONFIG.MAP_CHUNK_SIZE_TOKENS);

  const countRange = SLIDE_COUNT_MAP[state.deckLength];
  const targetSlideCount = Math.floor((countRange.min + countRange.max) / 2);

  const MIN_SLIDES_PER_CHUNK = GRAPH_CONFIG.MIN_SLIDES_PER_CHUNK;
  const BUFFER_MULTIPLIER = 1.3;
  const MAX_SLIDES_PER_CHUNK = GRAPH_CONFIG.MAX_SLIDES_PER_CHUNK;

  const slidesPerChunk = Math.max(
    MIN_SLIDES_PER_CHUNK,
    Math.min(
      MAX_SLIDES_PER_CHUNK,
      Math.ceil((targetSlideCount / packedChunks.length) * BUFFER_MULTIPLIER)
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
        slideType: state.slideType,
        deckLength: state.deckLength,
        targetSlideCount,
        slidesPerChunk,
      },
      null,
      2
    )
  );

  console.log(
    `[SlideDeckGraph] Creating ${packedChunks.length} parallel map tasks (~${slidesPerChunk} slides/chunk)`
  );

  return packedChunks.map((chunk, idx) => {
    const chunkTokens = estimateTokens(chunk);
    const preview = chunk.substring(0, 100).replace(/\n/g, " ");
    console.log(
      `  [Task ${idx + 1}/${packedChunks.length}] ${preview}... (~${chunkTokens} tokens)`
    );
    return new Send("map_process", {
      chunk,
      chunkIndex: idx,
      slideType: state.slideType,
      deckLength: state.deckLength,
      customPrompt: state.customPrompt,
      slidesPerChunk,
      targetSlideCount,
    });
  });
}
