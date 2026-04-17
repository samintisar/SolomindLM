"use node";

import { Send } from "@langchain/langgraph";

import { GRAPH_CONFIG, PROCESSING_CONFIG } from "./config.js";
import { packChunks, validateChunks } from "./chunkHelpers.js";
import type { OverallStateType } from "./state.js";

// Generate a short hash for identifying chunks in logs
function chunkHash(chunk: string): string {
  const start = chunk.substring(0, PROCESSING_CONFIG.HASH_START_LENGTH).replace(/\n/g, " ");
  const end = chunk
    .substring(Math.max(0, chunk.length - PROCESSING_CONFIG.HASH_END_LENGTH))
    .replace(/\n/g, " ");
  return `[${chunk.length} chars] "${start}..."..."${end}"`;
}

// Conditional routing function - returns Send objects for fan-out or 'collapse' string
export function routeToMap(state: OverallStateType): Send[] | "collapse" {
  console.log("\n" + "=".repeat(80));
  console.log("[SpreadsheetGraph] ===== ROUTE TO MAP PHASE =====");
  console.log("=".repeat(80));

  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        phase: "route_to_map",
        documentCount: state.documentIds?.length || 0,
        documentIds: state.documentIds || [],
        chunkCount: state.chunks?.length || 0,
        spreadsheetType: state.spreadsheetType,
      },
      null,
      2
    )
  );

  if (state.chunks && state.chunks.length > 0) {
    console.log(`\n[SpreadsheetGraph] Chunk breakdown:`);
    state.chunks.forEach((chunk, idx) => {
      const preview = chunkHash(chunk);
      console.log(`  [${idx + 1}/${state.chunks!.length}] ${preview.substring(0, 150)}...`);
    });
    console.log("");
  }

  if (state.chunks.length === 0) {
    console.warn("[SpreadsheetGraph] No chunks to process, routing to collapse");
    return "collapse";
  }

  const validatedChunks = validateChunks(state.chunks);
  const packedChunks = packChunks(validatedChunks, GRAPH_CONFIG.MAP_CHUNK_SIZE_TOKENS);

  console.log(`[SpreadsheetGraph] Creating ${packedChunks.length} parallel map tasks`);

  return packedChunks.map((chunk, idx) => {
    const preview = chunk.substring(0, 100).replace(/\n/g, " ");
    console.log(`  [Task ${idx + 1}/${packedChunks.length}] ${preview}... (${chunk.length} chars)`);
    return new Send("map_process", {
      chunk,
      chunkIndex: idx,
      totalChunks: packedChunks.length,
      spreadsheetType: state.spreadsheetType,
      customPrompt: state.customPrompt,
    });
  });
}
