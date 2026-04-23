"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id, Doc } from "../_generated/dataModel";
import { v } from "convex/values";
import { components } from "../_generated/api";
import { PersistentTextStreaming } from "@convex-dev/persistent-text-streaming";
import { ChatAgent, type GlobalRerankFn } from "../_agents/ChatAgent";
import { budgetConversationHistory } from "../_agents/chat/chatHistoryBudget";
import { HybridSearchHandler } from "../_agents/chat/hybrid_search.js";
import { cachedRerank, RerankDocument } from "../_agents/chat/rerankCache.js";
import { EmbeddingService } from "../_services/processing/EmbeddingServiceClient";
import { env } from "../_lib/env";

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

// Get threshold from env for filtering in vectorSearchRunner
const VECTOR_MATCH_THRESHOLD = parseFloat(process.env.CHAT_VECTOR_MATCH_THRESHOLD ?? "0.4");

type DocumentChunkDoc = Doc<"documentChunks">;
type VectorSearchHit = { _id: Id<"documentChunks">; _score: number };

// Initialize Persistent Text Streaming
const streaming = new PersistentTextStreaming(components.persistentTextStreaming);

/** Batched addChunk to stay under Convex mutation write throughput (e.g. 4 MiB/s on S16). */
const CHAT_STREAM_FLUSH_MS = parseInt(process.env.CHAT_STREAM_FLUSH_MS ?? "85", 10);
const CHAT_STREAM_FLUSH_MIN_CHARS = parseInt(process.env.CHAT_STREAM_FLUSH_MIN_CHARS ?? "200", 10);
const CHAT_STREAM_MAX_CHUNK_CHARS = Math.min(
  65536,
  Math.max(1024, parseInt(process.env.CHAT_STREAM_MAX_CHUNK_CHARS ?? "65536", 10))
);

const CHAT_HISTORY_FETCH_LIMIT = parseInt(process.env.CHAT_HISTORY_FETCH_LIMIT ?? "80", 10);

async function sleepMs(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
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
  },
  handler: async (ctx, args) => {
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
    });

    try {
      await ctx.runMutation(internal._lib.limits.checkDailyLimitInternal, {
        userId: args.userId,
        feature: "chat",
      });

      await streamChatResponse(
        ctx as any,
        args.streamId,
        args.userId,
        args.notebookId,
        args.message,
        args.documentIds,
        chunkAppender,
        conversationId
      );
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
  ctx: any,
  streamId: string,
  userId: string,
  notebookId: string,
  message: string,
  documentIds: string[] | undefined,
  chunkAppender: (text: string) => Promise<void>,
  conversationId: Id<"conversations">
): Promise<{ fullResponse: string; references: unknown[]; hasError: boolean }> {
  const notebookIdTyped = notebookId as Id<"notebooks">;

  const notebookDoc = await ctx.runQuery(internal.notebooks.index.getNotebookInternal, {
    notebookId: notebookIdTyped,
  });
  const keywordSearchChunkUserId = (notebookDoc?.userId ?? userId) as Id<"users">;

  // Fetch wiki articles for enriched RAG context
  let wikiArticles: Array<{ title: string; content: string; path: string }> | undefined;
  try {
    const wiki = await ctx.runQuery(internal.studio.wiki.index.getInternalByNotebook, {
      notebookId: notebookIdTyped,
    });
    if (wiki?.status === "completed" && wiki._id) {
      const articles = await ctx.runQuery(internal.studio.wiki.index.getArticlesInternal, {
        wikiId: wiki._id,
      });
      wikiArticles = articles
        .filter((a: any) => a.type === "concept" || a.type === "connection")
        .map((a: any) => ({ title: a.title, content: a.content, path: a.path }));
      console.log(
        `[ChatStream] Loaded ${wikiArticles!.length} wiki articles for RAG enrichment`
      );
    }
  } catch (e) {
    console.warn("[ChatStream] Wiki article fetch failed, continuing without wiki context:", e);
  }

  console.log("[ChatStream] Starting stream:", streamId);

  // Get conversation history
  const { messages: messageList } = await ctx.runQuery(internal.chat.index.getMessagesInternal, {
    conversationId,
    limit: CHAT_HISTORY_FETCH_LIMIT,
  });

  const fullHistory = messageList
    .filter((m: any) => m.role !== "system")
    .map((m: any) => ({ role: m.role, content: m.content }));

  const historyBudget = parseInt(env.CHAT_HISTORY_TOKEN_BUDGET ?? "4000", 10);
  const conversationHistory = budgetConversationHistory(fullHistory, historyBudget);

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

    const allChunks = await ctx.runQuery(internal.documents.index.listChunksByNotebook, {
      notebookId: notebookIdTyped,
    });
    console.log("[vectorSearchRunner] Total chunks in notebook:", allChunks.length);

    const results = await ctx.vectorSearch("documentChunks", "by_embedding", {
      vector: embedding,
      limit: limitToFetch,
      filter: (q: { eq: (field: "notebookId", value: Id<"notebooks">) => unknown }) =>
        q.eq("notebookId", notebookIdTyped),
    });

    console.log("[vectorSearchRunner] Vector search returned:", results.length, "results");

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
      console.log(
        `[vectorSearchRunner] Selected docs: ${selectedDocResults.length} chunks from ${docIds.length} sources`
      );

      if (selectedDocResults.length === 0) {
        console.warn("[vectorSearchRunner] No chunks found in selected documents at all");
        return [];
      }

      // Apply a LOWER threshold for selected documents (user explicitly chose these)
      const SELECTED_DOC_THRESHOLD = VECTOR_MATCH_THRESHOLD * 0.7; // 30% lower

      let thresholded = selectedDocResults.filter((r) => r._score >= SELECTED_DOC_THRESHOLD);
      console.log(
        `[vectorSearchRunner] Selected docs after threshold (${SELECTED_DOC_THRESHOLD}): ${thresholded.length} results`
      );

      // If still no results at lower threshold, try even lower as last resort
      if (thresholded.length === 0) {
        const LAST_RESORT_THRESHOLD = VECTOR_MATCH_THRESHOLD * 0.5; // 50% lower
        thresholded = selectedDocResults.filter((r) => r._score >= LAST_RESORT_THRESHOLD);
        console.warn(
          `[vectorSearchRunner] No results at ${SELECTED_DOC_THRESHOLD}, trying ${LAST_RESORT_THRESHOLD}: ${thresholded.length} results`
        );
      }

      // Final fallback: return top results from selected docs regardless of score
      if (thresholded.length === 0) {
        console.warn(
          `[vectorSearchRunner] No results even at lowest threshold, returning top ${Math.min(limit, selectedDocResults.length)} from selected docs`
        );
        thresholded = selectedDocResults.slice(0, Math.min(limit, selectedDocResults.length));
      }

      return thresholded.slice(0, limit);
    } else if (docIds && docIds.length === 0) {
      // User explicitly has no selected sources - return empty results
      console.log("[vectorSearchRunner] No sources selected, returning empty results");
      return [];
    } else {
      // docIds is undefined or not provided - apply normal threshold logic (should not happen after frontend fix)
      console.log(`[vectorSearchRunner] Applying threshold filter: ${VECTOR_MATCH_THRESHOLD}`);
      let thresholded = rows.filter((r) => r._score >= VECTOR_MATCH_THRESHOLD);
      console.log(
        `[vectorSearchRunner] After threshold (${VECTOR_MATCH_THRESHOLD}): ${thresholded.length} results (from ${rows.length})`
      );

      // Log score distribution for debugging
      if (rows.length > 0) {
        const scores = rows.map((r) => r._score);
        console.log(
          `[vectorSearchRunner] Score distribution: min=${Math.min(...scores).toFixed(3)}, max=${Math.max(...scores).toFixed(3)}, avg=${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(3)}`
        );
      }

      // Fallback: If no results pass threshold, progressively lower it
      if (thresholded.length === 0 && rows.length > 0) {
        const FALLBACK_THRESHOLDS = [0.35, 0.3, 0.25, 0.2];
        for (const fallbackThreshold of FALLBACK_THRESHOLDS) {
          thresholded = rows.filter((r) => r._score >= fallbackThreshold);
          if (thresholded.length > 0) {
            console.warn(
              `[vectorSearchRunner] No results at threshold ${VECTOR_MATCH_THRESHOLD}. Using fallback threshold ${fallbackThreshold}: ${thresholded.length} results`
            );
            break;
          }
        }
        // Last resort: return top results regardless of score
        if (thresholded.length === 0) {
          console.warn(
            `[vectorSearchRunner] No results even at lowest threshold. Returning top ${Math.min(limit, rows.length)} results regardless of score.`
          );
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
  ): Promise<any[]> => {
    console.log("[keywordSearchRunner] executing with closure-captured context");

    const results = await ctx.runQuery(internal.documents.index.keywordSearch, {
      notebookId: notebookIdTyped,
      userId: keywordSearchChunkUserId,
      query,
      limit,
      documentIds: docIds as any,
    });

    console.log("[keywordSearchRunner] returned", results.length, "results");
    return results;
  };

  // Initialize HybridSearchHandler with both vector and keyword search
  const embeddingService = new EmbeddingService(process.env.OPENAI_API_KEY || "");

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

  const agent = new ChatAgent({
    vectorSearchHandler: hybridSearch,
    globalRerankFn,
  });

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

  try {
    // Stream response chunks using ChatAgent
    for await (const chunk of agent.streamResponse(
      {
        userId,
        noteId: notebookId,
        conversationHistory,
        documentIds,
        groundingMode: notebookGrounding,
        wikiArticles,
      },
      message
    )) {
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
  const clarificationBody =
    agentTrace.clarification?.trim() &&
    `**Could you clarify?**\n\n${agentTrace.clarification.trim()}`;
  const contentToPersist = fullResponse.trim() || clarificationBody || "";

  // Terminal phase so persisted agentTrace does not end on "generating" (UI would show a spinner forever).
  if (!hasError && contentToPersist) {
    recordPhase("completed", "Response complete");
  }

  const metadataPayload = {
    agentTrace: {
      toolCalls: agentTrace.toolCalls,
      grounding: agentTrace.grounding,
      phases: agentTrace.phases.slice(-30),
      clarification: agentTrace.clarification,
    },
  };

  if (existingMessages.length === 0) {
    console.warn(
      "[ChatStream] Conversation was cleared during generation — skipping assistant message storage."
    );
  } else {
    const refsToStore = fullResponse.trim() ? references : undefined;
    const contentFinal =
      contentToPersist ||
      (hasError ? "Something went wrong while generating a response. Please try again." : "");

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
          console.warn(`[ChatStream] persistAssistantFromStream attempt ${attempt + 1} failed:`, e);
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
          console.error("[ChatStream] Tombstone after persist exhaustion failed:", e2);
        }
      }
    }
  }

  console.log("[ChatStream] Stream complete:", streamId);

  return {
    fullResponse,
    references,
    hasError,
  };
}
