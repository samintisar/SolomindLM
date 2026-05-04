"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id, Doc } from "../_generated/dataModel";
import { v } from "convex/values";
import { components } from "../_generated/api";
import { PersistentTextStreaming } from "@convex-dev/persistent-text-streaming";
import { ChatAgent, type GlobalRerankFn } from "../_agents/ChatAgent";
import { budgetConversationHistory } from "../_agents/chat/chatHistoryBudget";
import { refineWebSearchQuery } from "../_agents/chat/searchQueryRefiner";
import { HybridSearchHandler } from "../_agents/chat/hybrid_search.js";
import { AVAILABLE_SMART_MODEL_IDS, type SmartModelId } from "../_agents/chat/chatConfig.js";
import { cachedRerank, RerankDocument } from "../_agents/chat/rerankCache.js";
import { EmbeddingService } from "../_services/processing/EmbeddingServiceClient";
import { env } from "../_lib/env";
import { createServiceLogger } from "../_lib/logging/serviceLogger";
import { mapAgentEvidenceForSave } from "../research/mapEvidenceForDb";

import type { ChunkMetadata } from "../storage/ChatHistoryService";

interface VectorSearchResult {
  _id: Id<"documentChunks">;
  _score: number;
  documentId: Id<"documents">;
  notebookId: Id<"notebooks">;
  chunkIndex: number;
  content: string;
  embedding: number[];
  sourceTitle: string;
  sourceUrl?: string;
  // Chunk metadata for enhanced RAG context
  metadata?: ChunkMetadata;
}

// Vector match threshold for filtering in vectorSearchRunner
const VECTOR_MATCH_THRESHOLD = 0.4;

type DocumentChunkDoc = Doc<"documentChunks">;
type VectorSearchHit = { _id: Id<"documentChunks">; _score: number };

// Initialize Persistent Text Streaming
const _streaming = new PersistentTextStreaming(components.persistentTextStreaming);

/** Batched addChunk to stay under Convex mutation write throughput (e.g. 4 MiB/s on S16). */
const CHAT_STREAM_FLUSH_MS = 85;
const CHAT_STREAM_FLUSH_MIN_CHARS = 200;
const CHAT_STREAM_MAX_CHUNK_CHARS = 65536;

const CHAT_HISTORY_FETCH_LIMIT = 80;

async function sleepMs(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

// ============================================================
// Deep Research — Plan Phase
// ============================================================

async function runResearchPlanPhase(
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
  userMessageId: Id<"messages"> | undefined
): Promise<void> {
  const { ResearchAgent } = await import("../_agents/research/index.js");
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
      throw new Error("[ResearchPlan] No user message found for this conversation; cannot attach plan.");
    }
    resolvedUserMessageId = lookedUp;
  }
  const embeddingService = new EmbeddingService(process.env.TOGETHER_AI_API_KEY ?? "");

  // Build hybrid search runner (same pattern as streamChatResponse)
  const vectorSearchRunner = async (embedding: number[], limit: number, docIds?: string[]) => {
    const limitToFetch = docIds?.length ? Math.max(limit * 3, 75) : limit;
    const vectorResults = await ctx.vectorSearch("documentChunks", "by_embedding", {
      vector: embedding,
      limit: limitToFetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      filter: (q: any) => q.eq("notebookId", notebookIdTyped),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chunkIds = vectorResults.map((r: any) => r._id);
    if (chunkIds.length === 0) return [];
    const fullChunks = await ctx.runQuery(internal.documents.index.getChunks, { chunkIds });
     
     
     
     
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chunkMap = new Map<any, any>(fullChunks.filter(Boolean).map((c: any) => [c._id, c] as [any, any]));
     
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const docIds_unique = [...new Set(vectorResults.map((r: any) => (chunkMap.get(r._id) as any)?.documentId).filter(Boolean))];
    const docRows = await ctx.runQuery(internal.documents.index.getDocumentsByIds, { documentIds: docIds_unique });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const titleMap = new Map(docRows.map((d: any) => [d._id, d.fileName]));
    const sourceUrlMap = new Map<string, string>();
    for (const d of docRows) {
      if (d.fileUrl?.trim() && (d.fileType === "url" || d.fileType === "youtube")) {
        sourceUrlMap.set(d._id, d.fileUrl);
      }
    }
    return vectorResults
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((x: any) => x !== null);
  };

  const keywordSearchRunner = async (query: string, limit: number, docIds?: string[]) => {
    return ctx.runQuery(internal.documents.index.keywordSearch, {
      notebookId: notebookIdTyped,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      userId: userId as any,
      query,
      limit,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      documentIds: docIds as any,
      quietLogs: true,
    });
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const promises: Promise<any[]>[] = [];
      const webChannels = channels.filter((ch) => ch === "web" || ch === "news");
      const academicChannels = channels.filter((ch) => ch === "academic");

      if (webChannels.length > 0) {
        for (const channel of webChannels) {
          promises.push(
            ctx.runAction(internal._services.search.TavilySearchService.discoverSourcesInternal, {
              query,
              maxResults: maxResults ?? 2,
              topic: channel === "web" ? "general" : channel,
              searchDepth: "basic",
              includeRawContent: false,
            }).catch((e: unknown) => {
              researchLog.warn("research_web_discovery_failed", { channel, error: String(e) });
              return [];
            })
          );
        }
      }

      if (academicChannels.length > 0) {
        promises.push(
          ctx.runAction(internal._services.search.AcademicSearchService.discoverAcademicPapersInternal, {
            query,
            maxResults: maxResults ?? 2,
          }).catch((e: unknown) => {
            researchLog.warn("research_academic_discovery_failed", { error: String(e) });
            return [];
          })
        );
      }

      const results = await Promise.all(promises);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      const { WebLoaderService } = await import("../_services/extraction/WebLoaderService.js");
      const loader = new WebLoaderService();
      return loader.loadWebPageWithMeta(url);
    },
    loadPaper: async (paper) => {
      const { AcademicLoaderService } = await import("../_services/extraction/AcademicLoaderService.js");
      const loader = new AcademicLoaderService();
      return loader.loadPaper(paper);
    },
    onProgress: async (phase, subQuestionId, sourcesFound) => {
      await chunkAppender(
        `\n__RESEARCH_PROGRESS:${JSON.stringify({ phase, subQuestionId, sourcesFound })}\n`
      );
    },
  });

  // Phase 1: Generate plan
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subQuestions = await agent.generatePlan(message, sourcePolicy as any);

  // Save plan to database
  const planId = await ctx.runMutation(internal.research.index.createResearchPlan, {
    userId,
    notebookId: notebookIdTyped,
    conversationId,
    messageId: resolvedUserMessageId,
    query: message,
    sourcePolicy,
    subQuestions: subQuestions.map((sq) => ({
      id: sq.id,
      question: sq.question,
      searchQueries: sq.searchQueries,
      sourceChannels: sq.sourceChannels,
    })),
  });

  // Stream the plan to the client
  await chunkAppender(
    `\n__RESEARCH_PLAN:${JSON.stringify({ planId, subQuestions, sourcePolicy })}\n`
  );

  // Persist a placeholder assistant message with plan metadata
  await ctx.runMutation(internal.chat.index.persistAssistantFromStream, {
    conversationId,
    streamId,
    content: `**Research plan generated** — ${subQuestions.length} sub-questions. Awaiting your approval.`,
    metadata: { researchPlanId: planId, isResearchPlan: true },
  });
}

/**
 * Internal action: run chat and write chunks to the persistent stream via addChunk.
 * Used by the HTTP route so the isolate bundle does not import this file (avoids @langchain/langgraph in isolate).
 */
export const runWithStreamId = internalAction({
  args: {
    streamId: v.string(),
    userId: v.string(),
    notebookId: v.string(),
    message: v.string(),
    documentIds: v.optional(v.array(v.string())),
    conversationId: v.optional(v.id("conversations")),
    deepResearch: v.optional(v.boolean()),
    sourcePolicy: v.optional(
      v.object({
        channels: v.array(v.string()),
        domainAllowlist: v.optional(v.array(v.string())),
        dateRange: v.optional(v.object({ start: v.number(), end: v.number() })),
        maxResultsPerChannel: v.optional(v.number()),
        credibilityTier: v.optional(v.string()),
        requirePrimarySources: v.optional(v.boolean()),
        recencyDays: v.optional(v.number()),
        dedupeStrategy: v.optional(v.string()),
      })
    ),
    /** Set by client after sendMessageOptimistic; server falls back to latest user message in conversation. */
    userMessageId: v.optional(v.id("messages")),
  },
  handler: async (ctx, args) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const streamId = args.streamId as any;

    const rawAddChunk = async (text: string) => {
      if (!text) return;
      await ctx.runMutation(components.persistentTextStreaming.lib.addChunk, {
        streamId,
        text,
        final: false,
      });
    };

    let tokenBuffer = "";
    let lastFlushAt = Date.now();

    const flushTokenBuffer = async () => {
      if (tokenBuffer.length === 0) return;
      while (tokenBuffer.length > 0) {
        const piece = tokenBuffer.slice(0, CHAT_STREAM_MAX_CHUNK_CHARS);
        tokenBuffer = tokenBuffer.slice(piece.length);
        await rawAddChunk(piece);
      }
      lastFlushAt = Date.now();
    };

    const chunkAppender = async (text: string) => {
      if (!text) return;

      // Protocol lines from streamChatResponse (\n__REFERENCES, \n__ERROR, …): flush tokens first, then one chunk.
      if (text.startsWith("\n__")) {
        await flushTokenBuffer();
        await rawAddChunk(text);
        return;
      }

      tokenBuffer += text;
      const now = Date.now();
      const dueBySize = tokenBuffer.length >= CHAT_STREAM_FLUSH_MIN_CHARS;
      const dueByTime = tokenBuffer.length > 0 && now - lastFlushAt >= CHAT_STREAM_FLUSH_MS;
      if (dueBySize || dueByTime) {
        await flushTokenBuffer();
      }
    };

    const conversationId = await ctx.runMutation(internal.chat.index.ensureConversation, {
      notebookId: args.notebookId as Id<"notebooks">,
      userId: args.userId as Id<"users">,
      conversationId: args.conversationId,
    });

    let generationSucceeded = false;
    try {
      await ctx.runMutation(internal._lib.limits.checkDailyLimitInternal, {
        userId: args.userId,
        feature: "chat",
      });

      if (args.deepResearch) {
        await runResearchPlanPhase(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ctx as any,
          args.streamId,
          args.userId,
          args.notebookId,
          args.message,
          args.documentIds,
          args.sourcePolicy ?? { channels: ["notebook"] },
          chunkAppender,
          conversationId,
          args.userMessageId
        );
      } else {
        await streamChatResponse(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ctx as any,
          args.streamId,
          args.userId,
          args.notebookId,
          args.message,
          args.documentIds,
          chunkAppender,
          conversationId,
          args.sourcePolicy ?? { channels: ["notebook"] }
        );
      }

      generationSucceeded = true;
    } catch (e) {
      console.error("[ChatStream] runWithStreamId failed:", e);
      try {
        const msg = e instanceof Error ? e.message : "Unknown error while generating a response.";
        await ctx.runMutation(internal.chat.index.persistAssistantFromStream, {
          conversationId,
          streamId: args.streamId,
          content:
            "**We couldn't complete this reply.**\n\nPlease try sending your message again. If this keeps happening, try again in a moment.",
          metadata: { tombstone: true, errorMessage: msg.slice(0, 500) },
        });
      } catch (persistErr) {
        console.error("[ChatStream] Tombstone persist failed:", persistErr);
      }
    } finally {
      try {
        await flushTokenBuffer();
        await ctx.runMutation(components.persistentTextStreaming.lib.addChunk, {
          streamId,
          text: "",
          final: true,
        });
      } catch (flushErr) {
        console.error("[ChatStream] Final stream flush failed:", flushErr);
      }
    }

    // Consume rate limit token after confirmed delivery — non-fatal if this fails
    if (generationSucceeded) {
      try {
        await ctx.runMutation(internal._lib.limits.consumeDailyLimitInternal, {
          userId: args.userId,
          feature: "chat",
        });
      } catch (limitErr) {
        console.error("[ChatStream] consumeDailyLimit failed (non-fatal):", limitErr);
      }
    }

    try {
      await ctx.runMutation(internal.chat.index.releaseChatGenerationInternal, {
        conversationId,
      });
    } catch (releaseErr) {
      console.error("[ChatStream] releaseChatGenerationInternal failed:", releaseErr);
    }
  },
});

/**
 * Stream response using ChatAgent with the given chunk appender
 * This function can be called from the HTTP action's streamWriter callback
 */
export async function streamChatResponse(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  streamId: string,
  userId: string,
  notebookId: string,
  message: string,
  documentIds: string[] | undefined,
  chunkAppender: (text: string) => Promise<void>,
  conversationId: Id<"conversations">,
  sourcePolicy?: { channels: string[] }
): Promise<{ fullResponse: string; references: unknown[]; hasError: boolean }> {
  const notebookIdTyped = notebookId as Id<"notebooks">;

  const notebookDoc = await ctx.runQuery(internal.notebooks.index.getNotebookInternal, {
    notebookId: notebookIdTyped,
  });
  const keywordSearchChunkUserId = (notebookDoc?.userId ?? userId) as Id<"users">;

  const chatStreamLog = createServiceLogger("chatStream", "streamChatResponse", {
    userId,
    notebookId: notebookIdTyped,
  });
  chatStreamLog.info("stream_start", { streamId });

  // Get conversation history
  const { messages: messageList } = await ctx.runQuery(internal.chat.index.getMessagesInternal, {
    conversationId,
    limit: CHAT_HISTORY_FETCH_LIMIT,
  });

  const fullHistory = messageList
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((m: any) => m.role !== "system")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((m: any) => ({ role: m.role, content: m.content, metadata: m.metadata }));

  const historyBudget = parseInt(env.CHAT_HISTORY_TOKEN_BUDGET ?? "4000", 10);
  const conversationHistory = budgetConversationHistory(fullHistory, historyBudget);

  const notebookChatSettings = notebookDoc?.chatSettings as {
    instructionMode: "default" | "learningGuide" | "custom";
    customInstructions?: string;
    responseLength: "default" | "longer" | "shorter";
    smartModel?: string;
  } | undefined;

  // Validate model ID against whitelist, fall back to env default
  const validModelIds = new Set(AVAILABLE_SMART_MODEL_IDS);
  const resolvedSmartModel =
    notebookChatSettings?.smartModel && validModelIds.has(notebookChatSettings.smartModel as SmartModelId)
      ? notebookChatSettings.smartModel as SmartModelId
      : (env.SMART_LLM ?? "openai/gpt-oss-120b") as SmartModelId;

  // Merge chat settings: default/learningGuide follow the notebook (Configure chat).
  // Conversations only lock instruction mode for custom instructions once created as custom.
  // Otherwise stale snapshots from createConversation could ignore a later switch to Default.
  const conversationDoc = await ctx.runQuery(internal.chat.conversations.getInternal, {
    conversationId,
  });
  const notebookInstructionMode = (notebookChatSettings?.instructionMode ??
    "default") as "default" | "learningGuide" | "custom";
  const conversationInstructionMode = conversationDoc?.instructionMode as
    | "default"
    | "learningGuide"
    | "custom"
    | undefined;

  const mergedInstructionMode: "default" | "learningGuide" | "custom" =
    conversationInstructionMode === "custom" ? "custom" : notebookInstructionMode;

  const mergedChatSettings = {
    instructionMode: mergedInstructionMode,
    customInstructions:
      conversationInstructionMode === "custom"
        ? (conversationDoc?.customInstructions ?? notebookChatSettings?.customInstructions)
        : notebookChatSettings?.customInstructions,
    responseLength: notebookChatSettings?.responseLength ?? "default",
  };

  const notebookGrounding = notebookDoc?.chatGroundingMode as "async" | "sync" | "off" | undefined;

  // Vector search runner using Convex
  const vectorSearchRunner = async (
    embedding: number[],
    limit: number,
    docIds?: string[]
  ): Promise<VectorSearchResult[]> => {
    // Fetch more results only if we have specific documents to search within
    // This ensures we get enough relevant chunks from the selected documents
    const limitToFetch = docIds?.length ? Math.max(limit * 3, 75) : limit;

    const results = await ctx.vectorSearch("documentChunks", "by_embedding", {
      vector: embedding,
      limit: limitToFetch,
      filter: (q: { eq: (field: "notebookId", value: Id<"notebooks">) => unknown }) =>
        q.eq("notebookId", notebookIdTyped),
    });

    chatStreamLog.debug("vector_search_raw", { count: results.length });

    const chunkIds = (results as VectorSearchHit[]).map((r: VectorSearchHit) => r._id);
    const fullChunks =
      chunkIds.length > 0
        ? await ctx.runQuery(internal.documents.index.getChunks, { chunkIds })
        : [];

    const chunkMap = new Map<Id<"documentChunks">, DocumentChunkDoc>(
      (fullChunks as (DocumentChunkDoc | null)[])
        .filter((c: DocumentChunkDoc | null): c is DocumentChunkDoc => c !== null)
        .map((c: DocumentChunkDoc) => [c._id, c] as [Id<"documentChunks">, DocumentChunkDoc])
    );

    // Build results with metadata
    const rowsWithoutTitle: Array<{
      _id: Id<"documentChunks">;
      _score: number;
      documentId: Id<"documents">;
      notebookId: Id<"notebooks">;
      chunkIndex: number;
      content: string;
      embedding: number[];
      metadata?: ChunkMetadata;
    }> = [];

    for (const r of results as VectorSearchHit[]) {
      const chunk = chunkMap.get(r._id);
      if (!chunk) continue;

      rowsWithoutTitle.push({
        _id: r._id,
        _score: r._score ?? 0,
        documentId: chunk.documentId,
        notebookId: chunk.notebookId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        embedding: chunk.embedding ?? [],
        metadata: {
          totalChunks: chunk.totalChunks ?? undefined,
          relativePosition: chunk.relativePosition ?? undefined,
          chunkLengthChars: chunk.chunkLengthChars ?? undefined,
          wordCount: chunk.wordCount ?? undefined,
          sentenceCount: chunk.sentenceCount ?? undefined,
          pageNumber: chunk.pageNumber ?? undefined,
          sectionTitle: chunk.sectionTitle ?? undefined,
          sectionLevel: chunk.sectionLevel ?? undefined,
          headingPath: chunk.headingPath ?? undefined,
          previousChunkPreview: chunk.previousChunkPreview ?? undefined,
          nextChunkPreview: chunk.nextChunkPreview ?? undefined,
          hasCodeBlock: chunk.hasCodeBlock ?? undefined,
          hasMathNotation: chunk.hasMathNotation ?? undefined,
          hasTable: chunk.hasTable ?? undefined,
          hasBulletList: chunk.hasBulletList ?? undefined,
          hasNumberedList: chunk.hasNumberedList ?? undefined,
        },
      });
    }

    const documentIds = [...new Set(rowsWithoutTitle.map((r) => r.documentId))];
    const docRows = (await ctx.runQuery(internal.documents.index.getDocumentsByIds, {
      documentIds,
    })) as {
      _id: Id<"documents">;
      fileName: string;
      fileUrl?: string;
      fileType?: string;
    }[];
    const titleMap = new Map<Id<"documents">, string>(docRows.map((d) => [d._id, d.fileName]));
    const sourceUrlMap = new Map<Id<"documents">, string>();
    for (const d of docRows) {
      const u = d.fileUrl?.trim();
      if (!u) continue;
      if (d.fileType === "url" || d.fileType === "youtube") {
        sourceUrlMap.set(d._id, u);
      }
    }

    const rows: VectorSearchResult[] = rowsWithoutTitle.map((r) => ({
      ...r,
      sourceTitle: (titleMap.get(r.documentId) ?? "Document") as string,
      sourceUrl: sourceUrlMap.get(r.documentId),
    }));

    // REFACTORED: Apply documentIds filter FIRST, then threshold
    // This ensures selected documents get a lower threshold (user explicitly chose them)
    if (docIds && docIds.length > 0) {
      // User selected specific sources - handle differently
      const docIdSet = new Set(docIds);

      // Filter by selected documents FIRST, before applying threshold
      const selectedDocResults = rows.filter((r) => docIdSet.has(r.documentId));
      chatStreamLog.debug("vector_selected_docs", {
        chunks: selectedDocResults.length,
        sources: docIds.length,
      });

      if (selectedDocResults.length === 0) {
        chatStreamLog.warn("No chunks in selected documents", { sources: docIds.length });
        return [];
      }

      // Apply a LOWER threshold for selected documents (user explicitly chose these)
      const SELECTED_DOC_THRESHOLD = VECTOR_MATCH_THRESHOLD * 0.7; // 30% lower

      let thresholded = selectedDocResults.filter((r) => r._score >= SELECTED_DOC_THRESHOLD);
      chatStreamLog.debug("vector_after_threshold", {
        threshold: SELECTED_DOC_THRESHOLD,
        count: thresholded.length,
      });

      // If still no results at lower threshold, try even lower as last resort
      if (thresholded.length === 0) {
        const LAST_RESORT_THRESHOLD = VECTOR_MATCH_THRESHOLD * 0.5; // 50% lower
        thresholded = selectedDocResults.filter((r) => r._score >= LAST_RESORT_THRESHOLD);
        chatStreamLog.warn("vector_threshold_fallback", {
          tried: SELECTED_DOC_THRESHOLD,
          lastResort: LAST_RESORT_THRESHOLD,
          count: thresholded.length,
        });
      }

      // Final fallback: return top results from selected docs regardless of score
      if (thresholded.length === 0) {
        chatStreamLog.warn("vector_last_resort_top_k", {
          take: Math.min(limit, selectedDocResults.length),
        });
        thresholded = selectedDocResults.slice(0, Math.min(limit, selectedDocResults.length));
      }

      return thresholded.slice(0, limit);
    } else if (docIds && docIds.length === 0) {
      // User explicitly has no selected sources - return empty results
      chatStreamLog.debug("vector_no_sources_selected", {});
      return [];
    } else {
      // docIds is undefined or not provided - apply normal threshold logic (should not happen after frontend fix)
      chatStreamLog.debug("vector_threshold_apply", { threshold: VECTOR_MATCH_THRESHOLD });
      let thresholded = rows.filter((r) => r._score >= VECTOR_MATCH_THRESHOLD);
      chatStreamLog.debug("vector_after_threshold_global", {
        threshold: VECTOR_MATCH_THRESHOLD,
        count: thresholded.length,
        from: rows.length,
      });

      if (rows.length > 0) {
        const scores = rows.map((r) => r._score);
        chatStreamLog.debug("vector_score_distribution", {
          min: Math.min(...scores),
          max: Math.max(...scores),
          avg: scores.reduce((a, b) => a + b, 0) / scores.length,
        });
      }

      // Fallback: If no results pass threshold, progressively lower it
      if (thresholded.length === 0 && rows.length > 0) {
        const FALLBACK_THRESHOLDS = [0.35, 0.3, 0.25, 0.2];
        for (const fallbackThreshold of FALLBACK_THRESHOLDS) {
          thresholded = rows.filter((r) => r._score >= fallbackThreshold);
          if (thresholded.length > 0) {
            chatStreamLog.warn("vector_fallback_threshold", {
              original: VECTOR_MATCH_THRESHOLD,
              fallbackThreshold,
              count: thresholded.length,
            });
            break;
          }
        }
        // Last resort: return top results regardless of score
        if (thresholded.length === 0) {
          chatStreamLog.warn("vector_last_resort_unfiltered", {
            take: Math.min(limit, rows.length),
          });
          thresholded = rows.slice(0, Math.min(limit, rows.length));
        }
      }

      return thresholded.slice(0, limit);
    }
  };

  // Keyword search runner: full-text index filters by chunk.userId; chunks use notebook owner's id for RAG.
  const keywordSearchRunner = async (
    query: string,
    limit: number,
    docIds?: string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any[]> => {
    chatStreamLog.debug("keyword_search_runner", { phase: "start" });

    const results = await ctx.runQuery(internal.documents.index.keywordSearch, {
      notebookId: notebookIdTyped,
      userId: keywordSearchChunkUserId,
      query,
      limit,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      documentIds: docIds as any,
    });

    chatStreamLog.debug("keyword_search_runner", { returned: results.length });
    return results;
  };

  // Initialize HybridSearchHandler with both vector and keyword search
  const embeddingService = new EmbeddingService(process.env.TOGETHER_AI_API_KEY || "");

  // Create rerank function closure that matches RerankFunction signature
  // The closure captures `ctx` from the outer scope
  const rerankFn = async (
    query: string,
    documents: Array<{ id: string; content: string }>
  ): Promise<Array<{ id: string; content: string; score?: number }>> => {
    return cachedRerank(ctx, query, documents as RerankDocument[], "zerank-2", 15);
  };

  const globalRerankFn: GlobalRerankFn = rerankFn;

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

  let userPrefs: { outputLanguage?: string } | null = null;
  try {
    userPrefs = await ctx.runQuery(
      internal.userPreferences.index.getPreferencesByUserId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { userId: userId as any },
    );
  } catch (e) {
    console.warn("[chat] user preference fetch failed, using default language", e instanceof Error ? e.message : String(e));
  }

  const agent = new ChatAgent({
    vectorSearchHandler: hybridSearch,
    globalRerankFn,
    smartModel: resolvedSmartModel,
    outputLanguage: userPrefs?.outputLanguage,
    fetchDocumentFn: async (documentId: string) => {
      // Fetch all chunks for the document and stitch them together
      const chunks = await ctx.runQuery(internal.documents.index.listChunksByDocument, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        documentId: documentId as any,
      });
      if (!chunks || chunks.length === 0) return null;

      // Sort by chunk index and join content
       
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sortedChunks = chunks.sort((a: any, b: any) => a.chunkIndex - b.chunkIndex);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const content = sortedChunks.map((c: any) => c.content).join("\n\n");

      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        documentId: documentId as any,
        content,
        chunkCount: chunks.length,
      };
    },
  });

  // External search: discover sources from non-notebook channels (web, news, finance)
  const externalChannels = (sourcePolicy?.channels ?? ["notebook"]).filter(
    (ch) => ch !== "notebook"
  );
  let externalSources: Array<{
    title: string;
    url: string;
    snippet: string;
    sourceType: string;
    score?: number;
  }> = [];
  let externalChunks: Array<import("../storage/ChatHistoryService").ReferenceChunk> = [];

  if (externalChannels.length > 0) {
    const maxPerChannel = Math.ceil(10 / externalChannels.length);

    // Web/News channels via Tavily
    const webChannels = externalChannels.filter((ch) =>
      ["web", "news", "finance"].includes(ch)
    );
    // Academic channel via AcademicSearchService
    const academicChannels = externalChannels.filter((ch) => ch === "academic");

    const allResults: Array<{
      title: string;
      url: string;
      snippet: string;
      sourceType: string;
      score?: number;
      rawContent?: string;
    }> = [];

    if (webChannels.length > 0) {
      const channelToTopic = (ch: string) => (ch === "web" ? "general" : ch);
      const searchPromises: Promise<Array<typeof allResults[number]>>[] = [];

      // Refine the user message into a search-optimized query to improve result relevance.
      const refinedQuery = await refineWebSearchQuery(message);

      for (const channel of webChannels) {
        const topic = channelToTopic(channel);
        searchPromises.push(
          ctx.runAction(internal._services.search.TavilySearchService.discoverSourcesInternal, {
            query: refinedQuery,
            maxResults: maxPerChannel,
            topic,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }).then((results: any[]) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            results.map((r: any) => ({
              title: r.title ?? "Untitled",
              url: r.url ?? "",
              snippet: r.snippet ?? r.content ?? "",
              sourceType: channel,
              score: r.score,
              rawContent: r.rawContent ?? undefined,
            }))
          ).catch((e: unknown) => {
            chatStreamLog.warn("web_search_failed", { channel, topic, error: String(e) });
            return [];
          })
        );
      }

      const settled = await Promise.allSettled(searchPromises);
      for (const result of settled) {
        if (result.status === "fulfilled") {
          allResults.push(...result.value.filter((s) => s.url));
        }
      }
    }

    if (academicChannels.length > 0) {
      const academicQuery = await refineWebSearchQuery(message);
      try {
        const academicResults = await ctx.runAction(
          internal._services.search.AcademicSearchService.discoverAcademicPapersInternal,
          {
            query: academicQuery,
            maxResults: maxPerChannel,
          }
        );
        allResults.push(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...academicResults.map((r: any) => ({
            title: r.title ?? "Untitled",
            url: r.url ?? "",
            snippet: r.snippet ?? r.abstract ?? "",
            sourceType: "academic",
            score: r.score,
            rawContent: r.rawContent ?? undefined,
          }))
        );
      } catch (e: unknown) {
        chatStreamLog.warn("academic_search_failed", {
          query: academicQuery,
          error: e instanceof Error ? e.message : String(e),
          errorType: e instanceof Error ? e.constructor.name : typeof e,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          statusCode: (e as any)?.statusCode ?? (e as any)?.status ?? undefined,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          retryable: (e as any)?.retryable ?? undefined,
        });
      }
    }

    // Sort by score descending, cap at 5
    allResults.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const topResults = allResults.slice(0, 5);

    // Build metadata for frontend and ReferenceChunks for the LLM
    externalSources = topResults.map(({ rawContent: _rc, ...rest }) => rest);
    externalChunks = topResults
      .filter((r) => {
        const hasRawContent = r.rawContent && r.rawContent.trim().length > 100;
        const hasSnippet = r.snippet && r.snippet.trim().length > 50;
        return hasRawContent || hasSnippet;
      })
      .map((r, i) => {
        // Prefer rawContent when available, fallback to snippet
        const hasRawContent = r.rawContent && r.rawContent.trim().length > 100;
        const raw = hasRawContent ? r.rawContent!.trim() : r.snippet.trim();
        
        // Chunk content into ~3000 char pieces to fit within token budget
        const CHUNK_SIZE = 3000;
        const pieces: string[] = [];
        for (let start = 0; start < raw.length; start += CHUNK_SIZE) {
          pieces.push(raw.slice(start, start + CHUNK_SIZE));
        }
        // Take first 2 chunks for more depth (6000 chars total)
        const content = pieces.slice(0, 2).join("\n\n---\n\n") || raw;
        return {
          id: `ext_${i}`,
          sourceId: `ext_${i}`,
          sourceTitle: r.title,
          sourceUrl: r.url,
          content,
          chunkIndex: 0,
          // Assign a moderate score so token budget selector includes them
          similarity: 0.5,
          metadata: {
            sectionTitle: `${r.sourceType === "academic" ? "Academic" : "Web"} source (${r.sourceType})`,
          },
        } as import("../storage/ChatHistoryService").ReferenceChunk;
      });

    chatStreamLog.info("external_search_complete", {
      channels: externalChannels,
      resultCount: externalSources.length,
      chunksForLLM: externalChunks.length,
    });
  }

  let fullResponse = "";
  let references: unknown[] = [];
  let hasError = false;

  type TraceToolCall = {
    tool: string;
    query: string;
    status: "searching" | "done";
    resultCount?: number;
  };
  type TraceGrounding = {
    passed: boolean;
    issues: string[];
    message: string;
    soft?: boolean;
  };
  const agentTrace: {
    toolCalls: TraceToolCall[];
    grounding: TraceGrounding[];
    phases: Array<{ status: string; message: string }>;
    clarification?: string;
  } = {
    toolCalls: [],
    grounding: [],
    phases: [],
  };
  const toolKeyToIndex = new Map<string, number>();

  const recordToolCall = (data: TraceToolCall) => {
    const key = `${data.tool}\0${data.query}`;
    const idx = toolKeyToIndex.get(key);
    if (idx !== undefined) {
      agentTrace.toolCalls[idx] = { ...data };
    } else {
      toolKeyToIndex.set(key, agentTrace.toolCalls.length);
      agentTrace.toolCalls.push({ ...data });
    }
  };

  const recordPhase = (status: string, message: string) => {
    // Deduplicate: don't record the exact same status+message twice in a row
    const last = agentTrace.phases[agentTrace.phases.length - 1];
    if (last && last.status === status && last.message === message) {
      return; // Skip duplicate
    }
    agentTrace.phases.push({ status, message });
  };

  const includeNotebook = (sourcePolicy?.channels ?? ["notebook"]).includes("notebook");
  const isGenerationActive = async (): Promise<boolean> =>
    await ctx.runQuery(internal.chat.index.isChatGenerationActiveInternal, { conversationId });

  try {
    // Stream response chunks using ChatAgent
    for await (const chunk of agent.streamResponse(
      {
        userId,
        noteId: notebookId,
        conversationHistory,
        documentIds: includeNotebook ? documentIds : [],
        enableNotebookSearch: includeNotebook,
        groundingMode: notebookGrounding,
        externalChunks: externalChunks.length > 0 ? externalChunks : undefined,
        chatSettings: mergedChatSettings,
      },
      message,
      streamId
    )) {
      if (!(await isGenerationActive())) {
        chatStreamLog.info("stream_cancelled", {
          streamId,
          detail: "in_flight_refcount_cleared",
        });
        break;
      }
      if (chunk.type === "token") {
        fullResponse += chunk.data ?? "";

        // Append token to persistent stream (appears immediately to client)
        await chunkAppender(chunk.data ?? "");
      } else if (chunk.type === "references") {
        references = chunk.data ?? [];

        // Append references as JSON metadata
        await chunkAppender(`\n__REFERENCES:${JSON.stringify(references)}\n`);
      } else if (chunk.type === "status") {
        if (chunk.status) {
          recordPhase(chunk.status, chunk.message ?? "");
        }
        // Append status as metadata
        await chunkAppender(`\n__STATUS:${chunk.status}:${chunk.message ?? ""}\n`);
      } else if (chunk.type === "grounding_check") {
        const g = chunk.data as Partial<TraceGrounding>;
        if (g && typeof g.passed === "boolean") {
          agentTrace.grounding.push({
            passed: g.passed,
            issues: Array.isArray(g.issues) ? g.issues : [],
            message: typeof g.message === "string" ? g.message : "",
          });
        }
        // Append grounding check as metadata
        await chunkAppender(`\n__GROUNDING:${JSON.stringify(chunk.data)}\n`);
      } else if (chunk.type === "grounding_warn") {
        const g = chunk.data as Partial<TraceGrounding>;
        if (g && typeof g.passed === "boolean") {
          agentTrace.grounding.push({
            passed: g.passed,
            issues: Array.isArray(g.issues) ? g.issues : [],
            message: typeof g.message === "string" ? g.message : "",
            soft: true,
          });
        }
        await chunkAppender(
          `\n__GROUNDING_WARN:${JSON.stringify({ ...(chunk.data as object), soft: true })}\n`
        );
      } else if (chunk.type === "tool_call") {
        const tc = chunk.data as TraceToolCall;
        if (tc?.tool && tc.status) {
          recordToolCall({
            tool: tc.tool,
            query: tc.query ?? "",
            status: tc.status,
            resultCount: tc.resultCount,
          });
        }
        await chunkAppender(`\n__TOOL_CALL:${JSON.stringify(chunk.data)}\n`);
      } else if (chunk.type === "followups") {
        await chunkAppender(`\n__FOLLOWUPS:${JSON.stringify(chunk.data)}\n`);
      } else if (chunk.type === "clarification") {
        const q = (chunk.data as { question?: string })?.question ?? "";
        agentTrace.clarification = q;
        await chunkAppender(`\n__CLARIFICATION:${JSON.stringify(chunk.data)}\n`);
      } else if (chunk.type === "error") {
        hasError = true;
        await chunkAppender(`\n__ERROR:${JSON.stringify(chunk.data)}\n`);
        break;
      } else if (chunk.type === "done") {
        // Emit discovered external sources before done signal
        if (externalSources.length > 0) {
          await chunkAppender(`\n__EXTERNAL_SOURCES:${JSON.stringify(externalSources)}\n`);
        }
        await chunkAppender(`\n__DONE\n`);
      }
    }
  } catch (error) {
    console.error("[ChatStream] Error during generation:", error);
    hasError = true;
    await chunkAppender(
      `\n__ERROR:${JSON.stringify({ message: error instanceof Error ? error.message : "Unknown error" })}\n`
    );
  }

  // Store final assistant message in database only if the conversation still has messages.
  // If the user cleared chat history while generation was in-flight (scheduled jobs survive
  // page reloads and are retried by Convex), skip persisting to avoid an orphaned assistant
  // message appearing without a corresponding user prompt.
  const { messages: existingMessages } = await ctx.runQuery(
    internal.chat.index.getMessagesInternal,
    {
      conversationId,
      limit: 1,
    }
  );
  const generationStillActive = await isGenerationActive();
  if (!generationStillActive) {
    chatStreamLog.info("assistant_persist_skipped", {
      streamId,
      detail: "generation_cancelled",
    });
    return {
      fullResponse,
      references,
      hasError: false,
    };
  }
  const clarificationBody =
    agentTrace.clarification?.trim() &&
    `**Could you clarify?**\n\n${agentTrace.clarification.trim()}`;
  const contentToPersist = fullResponse.trim() || clarificationBody || "";

  // Terminal phase so persisted agentTrace does not end on "generating" (UI would show a spinner forever).
  if (!hasError && contentToPersist) {
    recordPhase("completed", "Response complete");
  }

  const metadataPayload = {
    guidedLearning: {
      awaitingUserResponse:
        mergedChatSettings.instructionMode === "learningGuide" &&
        Boolean(contentToPersist) &&
        !hasError &&
        !agentTrace.clarification,
    },
    agentTrace: {
      toolCalls: agentTrace.toolCalls,
      grounding: agentTrace.grounding,
      phases: agentTrace.phases.slice(-30),
      clarification: agentTrace.clarification,
    },
    // Surfaces stream-error state on the persisted message so the UI can render
    // a "this response ended early" indicator after page reload, not just to
    // clients that observed the in-flight `__ERROR:` marker.
    hadStreamError: hasError || undefined,
    externalSources: externalSources.length > 0 ? externalSources : undefined,
  };

  if (existingMessages.length === 0) {
    chatStreamLog.warn("conversation_cleared_during_generation", {
      detail: "skip_assistant_persist",
    });
  } else {
    const refsToStore = fullResponse.trim() ? references : undefined;
    // When an error chunk arrives mid-stream after tokens, the in-flight
    // `__ERROR:` marker is lost on reload. Append a trailing notice so the
    // persisted message records that the response was cut short.
    const errorSuffix = "\n\n_⚠️ This response ended early due to an error. Please try again._";
    const contentFinal = hasError
      ? contentToPersist
        ? `${contentToPersist}${errorSuffix}`
        : "Something went wrong while generating a response. Please try again."
      : contentToPersist;

    if (contentFinal) {
      let persisted = false;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const res = await ctx.runMutation(internal.chat.index.persistAssistantFromStream, {
            conversationId,
            streamId,
            content: contentFinal,
            references: refsToStore,
            metadata: metadataPayload,
          });
          persisted = true;
          void res;
          break;
        } catch (e) {
          chatStreamLog.warn("persist_assistant_retry", {
            attempt: attempt + 1,
            error: e instanceof Error ? e.message : String(e),
          });
          if (attempt < 3) await sleepMs(150 * (attempt + 1));
        }
      }
      if (!persisted) {
        try {
          await ctx.runMutation(internal.chat.index.persistAssistantFromStream, {
            conversationId,
            streamId,
            content:
              "**We couldn't save this reply.**\n\nPlease try sending your message again. Your answer may have appeared above but might not be kept in history.",
            metadata: {
              ...metadataPayload,
              tombstone: true,
              persistFailed: true,
            },
          });
        } catch (e2) {
          chatStreamLog.error("tombstone_persist_failed", e2);
        }
      }
    }
  }

  chatStreamLog.info("stream_complete", { streamId });

  return {
    fullResponse,
    references,
    hasError,
  };
}

// ============================================================
// Deep Research — Execute Phase
// ============================================================

export const runResearchExecute = internalAction({
  args: {
    streamId: v.string(),
    runId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    // Hoisted so the catch block can read the partial output and write a
    // tombstone assistant message that preserves whatever streamed before
    // the failure, instead of leaving zero record on reload.
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

      const { ResearchAgent } = await import("../_agents/research/index.js");
      const apiKey = process.env.TOGETHER_API_KEY ?? "";
      const smartModel = process.env.SMART_MODEL ?? "openai/gpt-oss-120b";
      const embeddingService = new EmbeddingService(process.env.TOGETHER_AI_API_KEY ?? "");
      const notebookIdTyped = plan.notebookId;

      // Build hybrid search runner
      const vectorSearchRunner = async (embedding: number[], limit: number, docIds?: string[]) => {
        const limitToFetch = docIds?.length ? Math.max(limit * 3, 75) : limit;
        const vectorResults = await ctx.vectorSearch("documentChunks", "by_embedding", {
          vector: embedding,
          limit: limitToFetch,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          filter: (q: any) => q.eq("notebookId", notebookIdTyped),
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chunkIds = vectorResults.map((r: any) => r._id);
        if (chunkIds.length === 0) return [];
        const fullChunks = await ctx.runQuery(internal.documents.index.getChunks, { chunkIds });
         
         
         
         
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chunkMap = new Map<any, any>(fullChunks.filter(Boolean).map((c: any) => [c._id, c] as [any, any]));
         
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const docIds_unique = [...new Set(vectorResults.map((r: any) => (chunkMap.get(r._id) as any)?.documentId).filter(Boolean))];
        const docRows = await ctx.runQuery(internal.documents.index.getDocumentsByIds, { documentIds: docIds_unique });
         
         
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const titleMap = new Map<any, string>(docRows.map((d: any) => [d._id, d.fileName] as [any, string]));
        const sourceUrlMap = new Map<string, string>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const d of docRows as any[]) {
          if (d.fileUrl?.trim() && (d.fileType === "url" || d.fileType === "youtube")) {
            sourceUrlMap.set(d._id, d.fileUrl);
          }
        }
        return vectorResults
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((r: any) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
           
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((x: any) => x !== null) as any[];
      };

      const keywordSearchRunner = async (query: string, limit: number, docIds?: string[]) => {
        return ctx.runQuery(internal.documents.index.keywordSearch, {
          notebookId: notebookIdTyped,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          userId: args.userId as any,
          query,
          limit,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          documentIds: docIds as any,
          quietLogs: true,
        });
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          return hybridSearch.search(args.userId, String(notebookIdTyped), query, docIds, embedding, undefined, {
            skipRerank: true,
            allowEmpty: true,
            quiet: true,
          });
        },
        discoverSources: async (query, channels, maxResults) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const promises: Promise<any[]>[] = [];
          const webChannels = channels.filter((ch) => ch === "web" || ch === "news");
          const academicChannels = channels.filter((ch) => ch === "academic");

          if (webChannels.length > 0) {
            for (const channel of webChannels) {
              promises.push(
                ctx.runAction(internal._services.search.TavilySearchService.discoverSourcesInternal, {
                  query,
                  maxResults: maxResults ?? 5,
                  topic: channel === "web" ? "general" : channel,
                }).catch((e: unknown) => {
                  researchLog.warn("research_web_discovery_failed", { channel, error: String(e) });
                  return [];
                })
              );
            }
          }

          if (academicChannels.length > 0) {
            promises.push(
              ctx.runAction(internal._services.search.AcademicSearchService.discoverAcademicPapersInternal, {
                query,
                maxResults: maxResults ?? 5,
              }).catch((e: unknown) => {
                researchLog.warn("research_academic_discovery_failed", { error: String(e) });
                return [];
              })
            );
          }

          const results = await Promise.all(promises);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          const { WebLoaderService } = await import("../_services/extraction/WebLoaderService.js");
          const loader = new WebLoaderService();
          return loader.loadWebPageWithMeta(url);
        },
        loadPaper: async (paper) => {
          const { AcademicLoaderService } = await import("../_services/extraction/AcademicLoaderService.js");
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        plan.subQuestions.map((sq: any) => ({ ...sq, status: "pending" as const })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      // Persist assistant message
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
      // Surface the failure on the open stream and as a persisted assistant
      // message; without this, the client only sees `final: true` (no error
      // marker) and reload shows no record of why the run stopped.
      try {
        await chunkAppender(
          `\n__ERROR:${JSON.stringify({ message: errorMessage })}\n`
        );
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
