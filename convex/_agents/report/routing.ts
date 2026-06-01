"use node";

import { Send } from "@langchain/langgraph";
import { chunkHash, packChunks, validateChunks } from "./chunkHelpers.js";
import { GRAPH_CONFIG } from "./config.js";
import type { OverallStateType } from "./state.js";

export function routeToMap(state: OverallStateType): Send[] | "collapse" {
  console.log("\n" + "=".repeat(80));
  console.log("[ReportGraph] ===== ROUTE TO MAP PHASE =====");
  console.log("=".repeat(80));

  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        phase: "route_to_map",
        documentCount: state.documentIds?.length || 0,
        documentIds: state.documentIds || [],
        chunkCount: state.chunks?.length || 0,
        reportType: state.reportType,
      },
      null,
      2
    )
  );

  if (state.chunks && state.chunks.length > 0) {
    console.log(`\n[ReportGraph] Chunk breakdown:`);
    state.chunks.forEach((chunk, idx) => {
      const preview = chunkHash(chunk);
      console.log(`  [${idx + 1}/${state.chunks!.length}] ${preview.substring(0, 150)}...`);
    });
    console.log("");
  }

  if (state.chunks.length === 0) {
    console.warn("[ReportGraph] No chunks to process, routing to collapse");
    return "collapse";
  }

  const validatedChunks = validateChunks(state.chunks);
  const packedChunks = packChunks(validatedChunks, GRAPH_CONFIG.MAP_CHUNK_SIZE_TOKENS);

  console.log(`[ReportGraph] Creating ${packedChunks.length} parallel map tasks`);

  return packedChunks.map((chunk, idx) => {
    const preview = chunk.substring(0, 100).replace(/\n/g, " ");
    console.log(`  [Task ${idx + 1}/${packedChunks.length}] ${preview}... (${chunk.length} chars)`);
    return new Send("map_process", {
      chunk,
      chunkIndex: idx,
      totalChunks: packedChunks.length,
      reportType: state.reportType,
      customPrompt: state.customPrompt,
    });
  });
}
