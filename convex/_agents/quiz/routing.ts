"use node";

import { Send } from "@langchain/langgraph";
import { packChunks, validateChunks } from "./chunkHelpers.js";
import { GRAPH_CONFIG } from "./config.js";
import type { OverallStateType } from "./state.js";

export interface RouteToMapDeps {
  estimateTokens: (text: string) => number;
}

export function routeToMap(state: OverallStateType, deps: RouteToMapDeps): Send[] | "collapse" {
  console.log("\n" + "=".repeat(80));
  console.log("[QuizGraph] ===== ROUTE TO MAP PHASE =====");
  console.log("=".repeat(80));

  if (state.chunks.length === 0) {
    console.warn("[QuizGraph] No chunks to process, routing to collapse");
    return "collapse";
  }

  const validatedChunks = validateChunks(state.chunks);
  const packedChunks = packChunks(validatedChunks, GRAPH_CONFIG.MAP_CHUNK_SIZE_TOKENS);

  const MIN_QUESTIONS_PER_CHUNK = GRAPH_CONFIG.MIN_QUESTIONS_PER_CHUNK;
  const BUFFER_MULTIPLIER = 1.2;
  const MAX_QUESTIONS_PER_CHUNK = GRAPH_CONFIG.MAX_QUESTIONS_PER_CHUNK;

  // Calculate questions per chunk
  const questionsPerChunk = Math.max(
    MIN_QUESTIONS_PER_CHUNK,
    Math.min(
      MAX_QUESTIONS_PER_CHUNK,
      Math.ceil((state.questionCount / packedChunks.length) * BUFFER_MULTIPLIER)
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
        targetQuestionCount: state.questionCount,
        questionsPerChunk,
        difficulty: state.difficulty,
        focus: state.focus,
      },
      null,
      2
    )
  );

  console.log(
    `[QuizGraph] Creating ${packedChunks.length} parallel map tasks (~${questionsPerChunk} questions/chunk)`
  );

  return packedChunks.map((chunk, idx) => {
    const chunkTokens = deps.estimateTokens(chunk);
    const preview = chunk.substring(0, 100).replace(/\n/g, " ");
    console.log(
      `  [Task ${idx + 1}/${packedChunks.length}] ${preview}... (~${chunkTokens} tokens)`
    );
    return new Send("map_process", {
      chunk,
      chunkIndex: idx,
      questionCount: state.questionCount,
      difficulty: state.difficulty,
      focus: state.focus,
      questionsPerChunk,
    });
  });
}
