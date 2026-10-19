import { createHash } from "crypto";
import type { RetrievalConfigSnapshot } from "./types";

/**
 * Compute a stable hash from the retrieval config so that runs with
 * different settings are comparable and not mixed in metric aggregation.
 *
 * Called once when a runner is instantiated, then passed through every
 * artifact and metric row for the run.
 */
export function computeConfigHash(config: RetrievalConfigSnapshot): string {
  // Deterministic JSON ordering
  const payload = JSON.stringify({
    contextTokenBudget: config.contextTokenBudget,
    minRelevanceThreshold: config.minRelevanceThreshold,
    maxChunksHardLimit: config.maxChunksHardLimit,
    vectorMatchThreshold: config.vectorMatchThreshold,
    vectorMatchCount: config.vectorMatchCount,
    rerankThreshold: config.rerankThreshold,
    rerankTopN: config.rerankTopN,
    maxResults: config.maxResults,
    keywordMatchCount: config.keywordMatchCount,
    rrfK: config.rrfK,
    enableHybrid: config.enableHybrid,
    hybridThreshold: config.hybridThreshold,
    listQueryContextTokenBudget: config.listQueryContextTokenBudget,
    listQueryMaxSelectedChunks: config.listQueryMaxSelectedChunks,
    neighbourPassageTokenBudget: config.neighbourPassageTokenBudget,
    maxNeighbourPassages: config.maxNeighbourPassages,
    openingPassageTokenBudget: config.openingPassageTokenBudget,
    maxOpeningPassages: config.maxOpeningPassages,
    multiSourceExtraTokensPerDocument: config.multiSourceExtraTokensPerDocument,
    multiSourceMaxExtraTokens: config.multiSourceMaxExtraTokens,
    perSourcePassagesPerSearch: config.perSourcePassagesPerSearch,
    maxPerSourceDocuments: config.maxPerSourceDocuments,
    chunkSizeTokens: config.chunkSizeTokens,
    chunkOverlapTokens: config.chunkOverlapTokens,
    smartModel: config.smartModel,
    fastModel: config.fastModel,
    promptVersion: config.promptVersion,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 12);
}
