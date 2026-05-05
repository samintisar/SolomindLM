/**
 * Convex action for running the ResearchAgent in eval mode.
 *
 * Constructs a ResearchAgent with the same production services,
 * runs plan + execute, and returns artifacts for scoring.
 *
 * SECURITY: Gated by RAG_EVALS_ENABLED + RAG_EVAL_SECRET.
 */
"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { ResearchAgent } from "../_agents/research/index.js";

import { EmbeddingService } from "../_services/processing/EmbeddingServiceClient";
import { env } from "../_lib/env";
import type { SubQuestion, SourcePolicy, ResearchContext } from "../_agents/research/types";
import { assertRagEvalGate } from "./_gate";
import { refineWebSearchQuery } from "../_agents/chat/searchQueryRefiner";

export const researchEvalActionArgs = {
  evalSecret: v.string(),
  question: v.string(),
  notebookId: v.id("notebooks"),
  documentIds: v.optional(v.array(v.id("documents"))),
  sourcePolicy: v.optional(
    v.object({
      channels: v.array(v.string()),
      maxResultsPerChannel: v.optional(v.number()),
      domainAllowlist: v.optional(v.array(v.string())),
      recencyDays: v.optional(v.number()),
    })
  ),
};

export interface ResearchEvalResult {
  answer: string;
  subQuestions: SubQuestion[];
  evidence: Array<{
    subQuestionId: string;
    sourceType: string;
    sourceTitle: string;
    sourceUrl?: string;
    content: string;
    relevanceScore?: number;
    iteration: number;
  }>;
  latencyMs: number;
  sourcePolicy?: SourcePolicy;
  iterations: number;
}

export const runResearchEval = action({
  args: researchEvalActionArgs,
  handler: async (ctx, args): Promise<ResearchEvalResult> => {
    assertRagEvalGate(args.evalSecret);

    const startTime = Date.now();
    const notebookIdTyped = args.notebookId;

    const notebook = await ctx.runQuery(internal.notebooks.index.getNotebookInternal, {
      notebookId: notebookIdTyped,
    });
    if (!notebook) {
      throw new Error(
        `Notebook ${notebookIdTyped} not found. Verify RAG_EVAL_CONVEX_URL points at the correct deployment.`
      );
    }
    const evalUserId = notebook.userId as Id<"users">;
    const keywordSearchChunkUserId = evalUserId;

    // In-memory cache for discoverSources to avoid duplicate API calls within one eval run
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const searchCache = new Map<string, any[]>();

    const documentIdStrings = args.documentIds as Id<"documents">[] | undefined;

    // Build hybrid search runner (same as chat eval)
    const vectorSearchRunner = async (embedding: number[], limit: number, docIds?: string[]) => {
      const limitToFetch = docIds?.length ? Math.max(limit * 3, 75) : limit;
      const results = await ctx.vectorSearch("documentChunks", "by_embedding", {
        vector: embedding,
        limit: limitToFetch,
        filter: (q) => q.eq("notebookId", notebookIdTyped),
      });

      const chunkIds = (results as Array<{ _id: Id<"documentChunks">; _score: number }>).map(
        (r) => r._id
      );
      if (chunkIds.length === 0) return [];

      const fullChunks = await ctx.runQuery(internal.documents.index.getChunks, { chunkIds });
      const chunkMap = new Map(
        (fullChunks as Array<{ _id: Id<"documentChunks"> } & Record<string, unknown>>).map((c) => [
          c._id,
          c,
        ]) as [Id<"documentChunks">, Record<string, unknown>][]
      );

      const VECTOR_MATCH_THRESHOLD = parseFloat(env.CHAT_VECTOR_MATCH_THRESHOLD);
      const docIdSet = docIds ? new Set(docIds as Id<"documents">[]) : null;

      const rows: Array<{
        _id: Id<"documentChunks">;
        _score: number;
        content: string;
        chunkIndex: number;
        documentId: Id<"documents">;
        sourceTitle: string;
        sourceUrl: string | undefined;
      }> = [];

      for (const r of results as Array<{ _id: Id<"documentChunks">; _score: number }>) {
        const chunk = chunkMap.get(r._id);
        if (!chunk) continue;
        if (docIdSet && !docIdSet.has(chunk.documentId as Id<"documents">)) continue;
        const threshold = docIdSet ? VECTOR_MATCH_THRESHOLD * 0.5 : VECTOR_MATCH_THRESHOLD;
        if (r._score < threshold) continue;

        rows.push({
          _id: r._id,
          _score: r._score,
          content: chunk.content as string,
          chunkIndex: chunk.chunkIndex as number,
          documentId: chunk.documentId as Id<"documents">,
          sourceTitle: (chunk.sourceTitle as string) || "",
          sourceUrl: (chunk.sourceUrl as string) || undefined,
        });
      }
      return rows.slice(0, limit);
    };

    const keywordSearchRunner = async (query: string, limit: number, docIds?: string[]) => {
      return ctx.runQuery(internal.documents.index.keywordSearch, {
        notebookId: notebookIdTyped,
        userId: keywordSearchChunkUserId,
        query,
        limit,
        documentIds: docIds as Id<"documents">[] | undefined,
      });
    };

    const embeddingService = new EmbeddingService(process.env.TOGETHER_AI_API_KEY || "");

    // Build deps for ResearchAgent
    const deps = {
      apiKey: process.env.TOGETHER_AI_API_KEY || "",
      smartModel: process.env.SMART_MODEL || "openai/gpt-oss-120b",
      runHybridSearch: async (query: string, docIds?: string[]) => {
        const embedding = await embeddingService.embedText(query, "query");
        const vectorResults = await vectorSearchRunner(embedding, 10, docIds);
        const keywordResults = await keywordSearchRunner(query, 10, docIds);
        // Merge and deduplicate (simplified)
        const merged = [...vectorResults, ...keywordResults];
        const seen = new Set<string>();

        return merged
          .filter((r: any) => {
            const id = r._id || r.sourceId || String(r.documentId) + ":" + r.chunkIndex;
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
          })
          .map((r: any) => ({
            sourceId: r._id
              ? String(r._id)
              : r.sourceId || String(r.documentId) + ":" + r.chunkIndex,
            documentId: r.documentId ? String(r.documentId) : undefined,
            sourceTitle: r.sourceTitle || "",
            sourceUrl: r.sourceUrl,
            content: r.content,
            chunkIndex: r.chunkIndex,
            similarity: r._score || r.similarity,
          }));
      },
      discoverSources: async (
        query: string,
        channels: Array<"web" | "news" | "academic">,
        maxResults?: number
      ) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allResults: Array<any> = [];
        const refinedQuery = await refineWebSearchQuery(query);
        const maxPerChannel = Math.ceil((maxResults || 5) / channels.length);

        for (const channel of channels) {
          const cacheKey = `${refinedQuery}::${channel}::${maxPerChannel}`;
          const cached = searchCache.get(cacheKey);
          if (cached) {
            allResults.push(...cached);
            continue;
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let channelResults: any[] = [];
          if (channel === "academic") {
            try {
              const results = await ctx.runAction(
                internal._services.search.academic.AcademicSearchService.discoverAcademicPapersInternal,
                { query: refinedQuery, maxResults: maxPerChannel }
              );
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              channelResults = results.map((r: any) => ({
                title: r.title ?? "Untitled",
                url: r.url ?? "",
                snippet: r.snippet ?? r.abstract ?? "",
                sourceType: "academic",
                score: r.score,
                rawContent: r.rawContent ?? undefined,
              }));
            } catch (e) {
              console.warn("[ResearchEval] Academic search failed:", e);
            }
          } else {
            try {
              const results = await ctx.runAction(
                internal._services.search.TavilySearchService.discoverSourcesInternal,
                {
                  query: refinedQuery,
                  maxResults: maxPerChannel,
                  topic: channel === "web" ? "general" : channel,
                  searchDepth: "advanced",
                }
              );
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              channelResults = results.map((r: any) => ({
                title: r.title ?? "Untitled",
                url: r.url ?? "",
                snippet: r.snippet ?? r.content ?? "",
                sourceType: channel,
                score: r.score,
                rawContent: r.rawContent ?? undefined,
              }));
            } catch (e) {
              console.warn("[ResearchEval] Web/news search failed:", e);
            }
          }
          searchCache.set(cacheKey, channelResults);
          allResults.push(...channelResults);
        }
        return allResults;
      },
      loadWebPage: async (url: string) => {
        return ctx.runAction(internal._services.extractors.scrapeWebPageInternal, { url });
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      loadPaper: async (paper: any) => {
        const { AcademicLoaderService } =
          await import("../_services/extraction/AcademicLoaderService.js");
        const loader = new AcademicLoaderService(async (url: string) =>
          ctx.runAction(internal._services.extractors.scrapeWebPageInternal, { url })
        );
        return loader.loadPaper(paper);
      },
      onProgress: async () => {},
    };

    const agent = new ResearchAgent(deps);

    const sourcePolicyChannels = (args.sourcePolicy?.channels ?? ["notebook"]) as Array<
      "notebook" | "web" | "academic" | "news"
    >;
    const sourcePolicy: SourcePolicy = {
      channels: sourcePolicyChannels,
      maxResultsPerChannel: args.sourcePolicy?.maxResultsPerChannel ?? 5,
      ...(args.sourcePolicy?.domainAllowlist
        ? { domainAllowlist: args.sourcePolicy.domainAllowlist }
        : {}),
      ...(args.sourcePolicy?.recencyDays ? { recencyDays: args.sourcePolicy.recencyDays } : {}),
    };

    const context: ResearchContext = {
      userId: evalUserId as string,
      notebookId: notebookIdTyped as string,
      conversationHistory: [],
      documentIds: documentIdStrings,
    };

    // Phase 1: Plan
    const subQuestions = await agent.generatePlan(args.question, sourcePolicy);

    // Phase 2: Execute
    const result = await agent.executeResearch(args.question, subQuestions, sourcePolicy, context);

    let answer = "";
    const evidence: ResearchEvalResult["evidence"] = [];
    let iterations = 0;

    for await (const chunk of result) {
      switch (chunk.type) {
        case "token":
          answer += chunk.data ?? "";
          break;
        case "evidence":
          for (const e of chunk.data ?? []) {
            evidence.push({
              subQuestionId: e.subQuestionId,
              sourceType: e.sourceType,
              sourceTitle: e.sourceTitle,
              sourceUrl: e.sourceUrl,
              content: e.content,
              relevanceScore: e.relevanceScore,
              iteration: e.iteration,
            });
          }
          iterations = Math.max(iterations, ...evidence.map((e) => e.iteration));
          break;
        case "done":
          break;
      }
    }

    return {
      answer,
      subQuestions,
      evidence,
      latencyMs: Date.now() - startTime,
      sourcePolicy,
      iterations: iterations || 1,
    };
  },
});
