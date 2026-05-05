"use node";

import { internal } from "../../_generated/api";
import { Id } from "../../_generated/dataModel";
import { HybridSearchHandler } from "../../_agents/chat/hybrid_search.js";
import { cachedRerank } from "../../_agents/chat/rerankCache.js";
import { EmbeddingService } from "../../_services/processing/EmbeddingServiceClient";
import { env } from "../../_lib/env";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";

export async function runResearchPlanPhase(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  streamId: string,
  userId: string,
  notebookId: string,
  message: string,
  documentIds: string[] | undefined,
  sourcePolicy: { channels: string[] },
  chunkAppender: (text: string) => Promise<void>,
  conversationId: Id<"conversations">,
  userMessageId: Id<"messages"> | undefined,
  academicFilters?: {
    provider?: string;
    fieldsOfStudy?: string[];
    publicationYearFrom?: number;
    publicationYearTo?: number;
    minCitations?: number;
    openAccessOnly?: boolean;
    hasFullText?: boolean;
  }
): Promise<void> {
  const { ResearchAgent } = await import("../../_agents/research/index.js");
  const researchLog = createServiceLogger("researchStream", "runResearchPlanPhase", {
    userId,
    notebookId: notebookId as Id<"notebooks">,
  });

  const apiKey = process.env.TOGETHER_API_KEY ?? "";
  const smartModel = process.env.SMART_MODEL ?? "openai/gpt-oss-120b";

  const notebookIdTyped = notebookId as Id<"notebooks">;

  let resolvedUserMessageId = userMessageId;
  if (!resolvedUserMessageId) {
    const lookedUp = await ctx.runQuery(internal.chat.index.getLatestUserMessageIdForPlanInternal, {
      conversationId,
      content: message,
    });
    if (!lookedUp) {
      throw new Error(
        "[ResearchPlan] No user message found for this conversation; cannot attach plan."
      );
    }
    resolvedUserMessageId = lookedUp;
  }
  const embeddingService = new EmbeddingService(process.env.TOGETHER_AI_API_KEY ?? "");

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
    const titleMap = new Map(docRows.map((d: any) => [d._id, d.fileName]));
    const sourceUrlMap = new Map<string, string>();
    for (const d of docRows) {
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
        .filter((x: any) => x !== null)
    );
  };

  const keywordSearchRunner = async (query: string, limit: number, docIds?: string[]) => {
    return ctx.runQuery(internal.documents.index.keywordSearch, {
      notebookId: notebookIdTyped,
      userId: userId as any,
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
      return hybridSearch.search(userId, notebookId, query, docIds, embedding, undefined, {
        skipRerank: true,
        allowEmpty: true,
        quiet: true,
      });
    },
    discoverSources: async (query, channels, maxResults) => {
      const promises: Promise<any[]>[] = [];
      const webChannels = channels.filter((ch) => ch === "web" || ch === "news");
      const academicChannels = channels.filter((ch) => ch === "academic");

      if (webChannels.length > 0) {
        for (const channel of webChannels) {
          promises.push(
            ctx
              .runAction(internal._services.search.TavilySearchService.discoverSourcesInternal, {
                query,
                maxResults: maxResults ?? 2,
                topic: channel === "web" ? "general" : channel,
                searchDepth: "basic",
                includeRawContent: false,
              })
              .catch((e: unknown) => {
                researchLog.warn("research_web_discovery_failed", { channel, error: String(e) });
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
                maxResults: maxResults ?? 2,
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

  const subQuestions = await agent.generatePlan(message, sourcePolicy as any);

  const planId = await ctx.runMutation(internal.research.index.createResearchPlan, {
    userId,
    notebookId: notebookIdTyped,
    conversationId,
    messageId: resolvedUserMessageId,
    query: message,
    sourcePolicy,
    academicFilters,
    subQuestions: subQuestions.map((sq) => ({
      id: sq.id,
      question: sq.question,
      searchQueries: sq.searchQueries,
      sourceChannels: sq.sourceChannels,
    })),
  });

  await chunkAppender(
    `\n__RESEARCH_PLAN:${JSON.stringify({ planId, subQuestions, sourcePolicy })}\n`
  );

  await ctx.runMutation(internal.chat.index.persistAssistantFromStream, {
    conversationId,
    streamId,
    content: `**Research plan generated** — ${subQuestions.length} sub-questions. Awaiting your approval.`,
    metadata: { researchPlanId: planId, isResearchPlan: true },
  });
}
