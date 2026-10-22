"use node";

import { MIN_RELEVANCE_THRESHOLD } from "../_agents/chat/chatConfig.js";
import type { VectorSearchRunner } from "../_agents/chat/vector_search.js";
import { ResearchAgent } from "../_agents/research/index.js";
import type { ResearchNodeDeps } from "../_agents/research/nodes";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import type { ServiceLogger } from "../_lib/logging/serviceLogger";
import type { AcademicPaperSource } from "../_model/literatureReviewSearchOptions.js";
import { EmbeddingService } from "../_services/ai/embeddingClient";
import { checkPaperOffTopic } from "../literatureReview/screenPaper.helpers.js";
import {
  createHybridSearch,
  createKeywordSearchRunner,
  createRerankFn,
  createResearchVectorSearchRunner,
  loadHybridSearchConfig,
} from "./_streamSearch";
import { createDiscoverSources, type DiscoveredSource } from "./_streamSources";
import type { StreamSourcePolicy } from "./stream";

/** Per-paper ceiling for the topic screen; the whole run has about four minutes. */
const PAPER_SCREEN_TIMEOUT_MS = 20_000;

export interface ResearchAgentConfig {
  apiKey: string;
  smartModel: string;
  ctx?: ActionCtx;
  researchId?: string;
  notebookId: Id<"notebooks">;
  userId: string;
  sourcePolicy: StreamSourcePolicy;
  onProgress: ResearchNodeDeps["onProgress"];
  log?: Pick<ServiceLogger, "warn">;
}

export async function buildResearchAgentDeps(
  config: ResearchAgentConfig
): Promise<ResearchNodeDeps> {
  const { apiKey, smartModel, ctx, researchId, notebookId, userId, sourcePolicy, onProgress, log } =
    config;

  const embeddingService = new EmbeddingService(process.env.OPENAI_API_KEY ?? "");
  const keywordSearchRunner = createKeywordSearchRunner(
    ctx ?? ({} as ActionCtx),
    notebookId,
    userId as Id<"users">,
    { quietLogs: true }
  );
  const rerankFn = createRerankFn(ctx ?? ({} as ActionCtx));
  const vectorSearchRunner = createResearchVectorSearchRunner(ctx ?? ({} as ActionCtx), notebookId);

  const hybridSearch = createHybridSearch(
    loadHybridSearchConfig(),
    embeddingService,
    // The research runner returns a slightly different shape (sourceId vs _id).
    // This is preserved from the original code and works at runtime.
    vectorSearchRunner as any as VectorSearchRunner,
    keywordSearchRunner,
    rerankFn
  );

  const discoverSources = createDiscoverSources(ctx ?? ({} as ActionCtx), sourcePolicy, {
    log,
  });

  const tavilyExtract = async (url: string) => {
    if (!ctx) throw new Error("Context required for tavilyExtract");
    const result = await ctx.runAction(
      internal._services.search.TavilySearchService.extractContentInternal,
      { urls: [url], extractDepth: "basic", format: "text" }
    );
    const hit = result.results.find((r) => r.url === url);
    if (!hit) {
      const fail = result.failedResults.find((f) => f.url === url);
      throw new Error(fail?.error ?? "Extraction failed");
    }
    return { title: hit.title ?? "", content: hit.rawContent, url };
  };

  return {
    ctx,
    researchId,
    apiKey,
    smartModel,
    runHybridSearch: async (query, docIds) => {
      const embedding = await embeddingService.embedText(query);
      const results = await hybridSearch.search(
        userId,
        String(notebookId),
        query,
        docIds,
        embedding,
        undefined,
        { allowEmpty: true, quiet: true }
      );
      // Reranked, so scores are on Voyage's scale and chat's relevance floor applies: the notebook
      // is searched for every sub-question, and a notebook off the question's topic must not fill
      // the writer's notebook share (#558).
      return results.filter((r) => (r.similarity ?? 0) >= MIN_RELEVANCE_THRESHOLD);
    },
    discoverSources: async (query, channels, maxResults) => {
      const results = await discoverSources(query, channels, maxResults);
      return results.map((r: DiscoveredSource) => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet,
        sourceType: r.sourceType,
        score: r.score,
        rawContent: r.rawContent,
        metadata: r.metadata
          ? {
              ...r.metadata,
              sourceApi: r.metadata.sourceApi as AcademicPaperSource | undefined,
            }
          : undefined,
      }));
    },
    loadWebPage: tavilyExtract,
    isPaperOnTopic: async (paper, query) =>
      !(await checkPaperOffTopic(paper, query, PAPER_SCREEN_TIMEOUT_MS)).offTopic,
    onProgress,
  };
}

export async function createResearchAgent(config: ResearchAgentConfig): Promise<ResearchAgent> {
  const deps = await buildResearchAgentDeps(config);
  return new ResearchAgent(deps);
}
