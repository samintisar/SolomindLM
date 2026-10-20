import { createHash } from "crypto";
import type { ChatConfigOverrides } from "../../convex/_agents/chat/chatConfigOverrides";
import type { RetrievalConfigSnapshot } from "./types";

/**
 * Compute a stable hash from the retrieval config so that runs with
 * different settings are comparable and not mixed in metric aggregation.
 *
 * Called once when a runner is instantiated, then passed through every
 * artifact and metric row for the run.
 */
export function computeConfigHash(config: RetrievalConfigSnapshot): string {
  // Deterministic JSON ordering. Overrides go last and only when one is set, so a run without
  // overrides keeps the hash it had before overrides were hashed at all.
  const overrides = definedOverrides(config.overrides);
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
    ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 12);
}

/** The overrides that are set, with keys sorted so their order does not change the hash. */
function definedOverrides(overrides: ChatConfigOverrides | undefined): ChatConfigOverrides {
  const entries = Object.entries(overrides ?? {})
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries) as ChatConfigOverrides;
}
