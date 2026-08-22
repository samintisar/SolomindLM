"use node";

import { Send } from "@langchain/langgraph";
import { selectStudioMapBatches } from "../_shared/studioExecutionMode.js";
import { countTokens } from "../_shared/tokenizer.js";
import type { OverallStateType } from "./state.js";

export function routeToMap(state: OverallStateType): Send[] | "collapse" {
  console.log("\n" + "=".repeat(80));
  console.log("[WrittenQuestionsGraph] ===== ROUTE TO MAP PHASE =====");
  console.log("=".repeat(80));

  if (state.chunks.length === 0) {
    console.warn("[WrittenQuestionsGraph] No chunks to process, routing to collapse");
    return "collapse";
  }

  const { mode, batches } = selectStudioMapBatches({
    documentCount: state.documentIds?.length || 0,
    chunks: state.chunks,
    estimateTokens: countTokens,
    pack: (chunks) => chunks,
  });

  if (batches.length === 0) {
    console.warn(
      "[WrittenQuestionsGraph] No map batches after skip-map planning, routing to collapse"
    );
    return "collapse";
  }

  const chunkCount = batches.length;
  const MIN_QUESTIONS_PER_CHUNK = 3;
  // 2.5× over-generation gives the heuristic + LLM dedup steps enough headroom
  // to land at or above `questionCount`. With 1.5× we routinely shrank to ~13
  // for a target of 20 on list-style sources, because near-duplicate
  // wordings collapse aggressively after dedupe.
  const BUFFER_MULTIPLIER = 2.5;
  const MAX_QUESTIONS_PER_CHUNK = 20;

  const questionsPerChunk = Math.max(
    MIN_QUESTIONS_PER_CHUNK,
    Math.min(
      MAX_QUESTIONS_PER_CHUNK,
      Math.ceil((state.questionCount / chunkCount) * BUFFER_MULTIPLIER)
    )
  );

  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        phase: "route_to_map",
        totalChunks: chunkCount,
        targetQuestionCount: state.questionCount,
        questionsPerChunk,
        difficulty: state.difficulty,
        questionType: state.questionType,
        focus: state.focus || "none",
      },
      null,
      2
    )
  );

  console.log(
    `[WrittenQuestionsGraph] Processing all ${chunkCount} chunks for ${state.questionCount} target questions`
  );
  console.log(
    `[WrittenQuestionsGraph] Creating ${chunkCount} parallel map tasks (~${questionsPerChunk} questions/chunk)`
  );

  console.log(`[WrittenQuestionsGraph] Execution mode ${mode}: creating ${chunkCount} map task(s)`);

  return batches.map((chunk, idx) => {
    const preview = chunk.substring(0, 100).replace(/\n/g, " ");
    console.log(`  [Task ${idx + 1}/${chunkCount}] ${preview}... (${chunk.length} chars)`);
    return new Send("map_process", {
      chunk,
      chunkIndex: idx,
      retryCount: 0,
      questionCount: state.questionCount,
      difficulty: state.difficulty,
      questionType: state.questionType,
      focus: state.focus,
      questionsPerChunk,
    });
  });
}
