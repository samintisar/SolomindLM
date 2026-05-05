"use node";

import { internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { Id } from "../../_generated/dataModel";
import { v } from "convex/values";
import { components } from "../../_generated/api";
import { HybridSearchHandler } from "../../_agents/chat/hybrid_search.js";
import { cachedRerank } from "../../_agents/chat/rerankCache.js";
import { EmbeddingService } from "../../_services/processing/EmbeddingServiceClient";
import { env } from "../../_lib/env";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";
import { mapAgentEvidenceForSave } from "../../research/mapEvidenceForDb";

export const runResearchExecute = internalAction({
  args: {
    streamId: v.string(),
    runId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const streamId = args.streamId as any;
    const runId = args.runId as Id<"researchRuns">;

    const rawAddChunk = async (text: string) => {
      if (!text) return;
      await ctx.runMutation(components.persistentTextStreaming.lib.addChunk, {
        streamId,
        text,
        final: false,
      });
    };

    const chunkAppender = async (text: string) => {
      if (!text) return;
      await rawAddChunk(text);
    };

    let fullResponse = "";
    let conversationIdForPersist: Id<"conversations"> | undefined;

    try {
      await ctx.runMutation(internal.research.index.updateRunProgress, {
        runId,
        status: "running",
      });

      const run = await ctx.runQuery(internal.research.index.getRunInternal, { runId });
      if (!run) throw new Error("Run not found");

      const plan = await ctx.runQuery(internal.research.index.getPlanInternal, {
        planId: run.planId,
      });
      if (!plan) throw new Error("Plan not found");
      conversationIdForPersist = plan.conversationId;

      const researchLog = createServiceLogger("chatStream", "researchExecute", {
        userId: args.userId,
        notebookId: plan.notebookId,
      });
      researchLog.operationStart({ runId: String(runId), planId: String(run.planId) });

      const { ResearchAgent } = await import("../../_agents/research/index.js");
      const apiKey = process.env.TOGETHER_API_KEY ?? "";
      const smartModel = process.env.SMART_MODEL ?? "openai/gpt-oss-120b";
      const embeddingService = new EmbeddingService(process.env.TOGETHER_AI_API_KEY ?? "");
      const notebookIdTyped = plan.notebookId;

      const vectorSearchRunner = async (embedding: number[], limit: number, docIds?: string[]) => {
        const limitToFetch = docIds?.length ? Math.max(limit * 3, 75) : limit;
        const vectorResults = await ctx.vectorSearch("documentChunks", "by_embedding", {
          vector: embedding,
          limit: limitToFetch,
          filter: (q: any) => q.eq("notebookId", notebookIdTyped),
        });
        const chunkIds = vectorResults.map((r: any) => r._id);
        if (chunkIds.length === 0) return [];
        const fullChunks = await ctx.runQuery(internal.documents.index.getChunks, { chunkIds });

        const chunkMap = new Map<any, any>(
          fullChunks.filter(Boolean).map((c: any) => [c._id, c] as [any, any])
        );

        const docIds_unique = [
          ...new Set(
            vectorResults.map((r: any) => (chunkMap.get(r._id) as any)?.documentId).filter(Boolean)
          ),
        ];
        const docRows = await ctx.runQuery(internal.documents.index.getDocumentsByIds, {
          documentIds: docIds_unique,
        });

        const titleMap = new Map<any, string>(
          docRows.map((d: any) => [d._id, d.fileName] as [any, string])
        );
        const sourceUrlMap = new Map<string, string>();
        for (const d of docRows as any[]) {
          if (d.fileUrl?.trim() && (d.fileType === "url" || d.fileType === "youtube")) {
            sourceUrlMap.set(d._id, d.fileUrl);
          }
        }
        return (
          vectorResults
            .map((r: any) => {
              const chunk = chunkMap.get(r._id) as any;
              if (!chunk) return null;
              return {
                sourceId: String(r._id),
                documentId: String(chunk.documentId),
                sourceTitle: titleMap.get(chunk.documentId) ?? "Document",
                sourceUrl: sourceUrlMap.get(String(chunk.documentId)),
                content: chunk.content as string,
                chunkIndex: chunk.chunkIndex as number,
                similarity: r._score ?? 0,
              };
            })
            .filter((x: any) => x !== null) as any[]
        );
      };

      const keywordSearchRunner = async (query: string, limit: number, docIds?: string[]) => {
        return ctx.runQuery(internal.documents.index.keywordSearch, {
          notebookId: notebookIdTyped,
          userId: args.userId as any,
          query,
          limit,
          documentIds: docIds as any,
          quietLogs: true,
        });
      };

      const rerankFn = async (query: string, documents: any[]) => {
        return cachedRerank(ctx, query, documents, "zerank-2", 15);
      };

      const hybridSearch = new HybridSearchHandler(
        {
          vectorMatchThreshold: parseFloat(env.CHAT_VECTOR_MATCH_THRESHOLD),
          vectorMatchCount: parseInt(env.CHAT_VECTOR_MATCH_COUNT, 10),
          rerankThreshold: parseInt(env.CHAT_RERANK_THRESHOLD, 10),
          rerankTopN: parseInt(env.CHAT_RERANK_TOP_N, 10),
          maxResults: parseInt(env.CHAT_MAX_RESULTS, 10),
          keywordMatchCount: parseInt(env.CHAT_KEYWORD_MATCH_COUNT, 10),
          rrfK: parseInt(env.CHAT_RRF_K, 10),
          enableHybrid: env.CHAT_ENABLE_HYBRID_SEARCH !== "false",
          hybridThreshold: parseFloat(env.CHAT_HYBRID_THRESHOLD),
        },
        embeddingService,
        vectorSearchRunner,
        keywordSearchRunner,
        rerankFn
      );

      const agent = new ResearchAgent({
        apiKey,
        smartModel,
        runHybridSearch: async (query, docIds) => {
          const embedding = await embeddingService.embedText(query);
          return hybridSearch.search(
            args.userId,
            String(notebookIdTyped),
            query,
            docIds,
            embedding,
            undefined,
            {
              skipRerank: true,
              allowEmpty: true,
              quiet: true,
            }
          );
        },
        discoverSources: async (query, channels, maxResults) => {
          const promises: Promise<any[]>[] = [];
          const webChannels = channels.filter((ch) => ch === "web" || ch === "news");
          const academicChannels = channels.filter((ch) => ch === "academic");
          const academicFilters = plan.academicFilters;

          if (webChannels.length > 0) {
            for (const channel of webChannels) {
              promises.push(
                ctx
                  .runAction(
                    internal._services.search.TavilySearchService.discoverSourcesInternal,
                    {
                      query,
                      maxResults: maxResults ?? 5,
                      topic: channel === "web" ? "general" : channel,
                    }
                  )
                  .catch((e: unknown) => {
                    researchLog.warn("research_web_discovery_failed", {
                      channel,
                      error: String(e),
                    });
                    return [];
                  })
              );
            }
          }

          if (academicChannels.length > 0) {
            promises.push(
              ctx
                .runAction(
                  internal._services.search.academic.AcademicSearchService.discoverAcademicPapersInternal,
                  {
                    query,
                    maxResults: maxResults ?? 5,
                    ...(academicFilters?.provider ? { provider: academicFilters.provider as "all" | "pubmed" | "arxiv" } : {}),
                    ...(academicFilters?.fieldsOfStudy ? { fieldsOfStudy: academicFilters.fieldsOfStudy } : {}),
                    ...(academicFilters?.publicationYearFrom ? { publicationYearFrom: academicFilters.publicationYearFrom } : {}),
                    ...(academicFilters?.publicationYearTo ? { publicationYearTo: academicFilters.publicationYearTo } : {}),
                    ...(academicFilters?.minCitations ? { minCitations: academicFilters.minCitations } : {}),
                    ...(academicFilters?.openAccessOnly ? { openAccessOnly: academicFilters.openAccessOnly } : {}),
                    ...(academicFilters?.hasFullText ? { hasFullText: academicFilters.hasFullText } : {}),
                  }
                )
                .catch((e: unknown) => {
                  researchLog.warn("research_academic_discovery_failed", { error: String(e) });
                  return [];
                })
            );
          }

          const results = await Promise.all(promises);
          return results.flat().map((r: any) => ({
            title: r.title ?? "Untitled",
            url: r.url ?? "",
            snippet: r.snippet ?? r.abstract ?? "",
            sourceType: r.sourceType ?? r.metadata?.sourceApi ?? "web",
            score: r.score,
            rawContent: r.rawContent,
            metadata: {
              pdfUrl: r.metadata?.pdfUrl,
              doi: r.metadata?.doi,
              citationCount: r.metadata?.citationCount,
              sourceApi: r.metadata?.sourceApi,
            },
          }));
        },
        loadWebPage: async (url: string) => {
          return ctx.runAction(internal._services.extractors.scrapeWebPageInternal, { url });
        },
        loadPaper: async (paper) => {
          const { AcademicLoaderService } =
            await import("../../_services/extraction/AcademicLoaderService.js");
          const loader = new AcademicLoaderService();
          return loader.loadPaper(paper);
        },
        onProgress: async (phase, subQuestionId, sourcesFound) => {
          await chunkAppender(
            `\n__RESEARCH_PROGRESS:${JSON.stringify({ phase, subQuestionId, sourcesFound })}\n`
          );
        },
      });

      const conversationTurns = await ctx.runQuery(
        internal.chat.index.getRecentConversationTurnsForResearchInternal,
        {
          conversationId: plan.conversationId,
          maxMessages: 24,
        }
      );

      const context = {
        userId: args.userId,
        notebookId: String(notebookIdTyped),
        conversationHistory: conversationTurns,
      };

      const gen = agent.executeResearch(
        plan.query,
        plan.subQuestions.map((sq: any) => ({ ...sq, status: "pending" as const })),
        plan.sourcePolicy as any,
        context
      );

      let researchReferences: unknown[] = [];

      for await (const chunk of gen) {
        if (chunk.type === "evidence") {
          const mapped = mapAgentEvidenceForSave(chunk.data);
          if (mapped.length > 0) {
            await ctx.runMutation(internal.research.index.saveEvidence, {
              runId,
              evidence: mapped,
            });
          }
        } else if (chunk.type === "token") {
          fullResponse += chunk.data ?? "";
          await chunkAppender(chunk.data ?? "");
        } else if (chunk.type === "references") {
          researchReferences = chunk.data ?? [];
          await chunkAppender(`\n__REFERENCES:${JSON.stringify(chunk.data)}\n`);
        } else if (chunk.type === "done") {
          await chunkAppender(`\n__DONE\n`);
        }
      }

      const contentFinal = fullResponse.trim() || "Research completed but produced no output.";
      await ctx.runMutation(internal.chat.index.persistAssistantFromStream, {
        conversationId: plan.conversationId,
        streamId: args.streamId,
        content: contentFinal,
        references: researchReferences.length > 0 ? researchReferences : undefined,
        metadata: { researchRunId: runId, isResearchResult: true },
      });

      await ctx.runMutation(internal.research.index.updateRunProgress, {
        runId,
        status: "completed",
      });
      researchLog.operationComplete({ runId: String(runId) });
    } catch (e) {
      const failLog = createServiceLogger("chatStream", "researchExecute", {
        userId: args.userId,
      });
      failLog.operationError(e, { runId: String(runId) });
      const errorMessage = e instanceof Error ? e.message : "Unknown error";
      await ctx.runMutation(internal.research.index.updateRunProgress, {
        runId,
        status: "failed",
        error: errorMessage,
      });
      try {
        await chunkAppender(`\n__ERROR:${JSON.stringify({ message: errorMessage })}\n`);
      } catch (streamErr) {
        failLog.warn("research_error_stream_failed", { error: String(streamErr) });
      }
      if (conversationIdForPersist) {
        try {
          const trimmed = fullResponse.trim();
          await ctx.runMutation(internal.chat.index.persistAssistantFromStream, {
            conversationId: conversationIdForPersist,
            streamId: args.streamId,
            content:
              trimmed.length > 0
                ? `${fullResponse}\n\n_⚠️ Research run failed before completing. Please try again._`
                : "Research run failed before producing a response. Please try again.",
            metadata: {
              researchRunId: runId,
              isResearchResult: true,
              hadStreamError: true,
              researchError: errorMessage.slice(0, 500),
            },
          });
        } catch (persistErr) {
          failLog.error("research_tombstone_persist_failed", persistErr);
        }
      }
    } finally {
      try {
        await ctx.runMutation(components.persistentTextStreaming.lib.addChunk, {
          streamId,
          text: "",
          final: true,
        });
      } catch (flushErr) {
        const flushLog = createServiceLogger("chatStream", "researchExecute", {
          userId: args.userId,
        });
        flushLog.error("stream_flush_failed", flushErr);
      }
    }
  },
});
