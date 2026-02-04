"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id, Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { PersistentTextStreaming } from "@convex-dev/persistent-text-streaming";
import { ChatAgent } from "../lib/services/agents/ChatAgent";
import { HybridSearchHandler } from "../lib/services/agents/chat/hybrid-search";
import { EmbeddingService } from "../lib/services/processing/EmbeddingServiceClient";

interface VectorSearchResult {
  _id: Id<"documentChunks">;
  _score: number;
  documentId: Id<"documents">;
  notebookId: Id<"notebooks">;
  chunkIndex: number;
  content: string;
  embedding: number[];
  sourceTitle: string;
}

// Get threshold from env for filtering in vectorSearchRunner
const VECTOR_MATCH_THRESHOLD = parseFloat(process.env.CHAT_VECTOR_MATCH_THRESHOLD ?? '0.4');

type DocumentChunkDoc = Doc<"documentChunks">;
type VectorSearchHit = { _id: Id<"documentChunks">; _score: number };

// Initialize Persistent Text Streaming
const streaming = new PersistentTextStreaming(
  components.persistentTextStreaming
);

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
    // Check daily chat limit
    await ctx.runMutation(internal.lib.limits.checkDailyLimitInternal, {
      userId: args.userId,
      feature: "chat",
    });

    const chunkAppender = async (text: string) => {
      await ctx.runMutation(components.persistentTextStreaming.lib.addChunk, {
        streamId: args.streamId as any,
        text,
        final: false,
      });
    };
    await streamChatResponse(
      ctx as any,
      args.streamId,
      args.userId,
      args.notebookId,
      args.message,
      args.documentIds,
      chunkAppender
    );
    await ctx.runMutation(components.persistentTextStreaming.lib.addChunk, {
      streamId: args.streamId as any,
      text: "",
      final: true,
    });
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
  chunkAppender: (text: string) => Promise<void>
): Promise<{ fullResponse: string; references: unknown[]; hasError: boolean }> {
  const notebookIdTyped = notebookId as Id<"notebooks">;

  console.log("[ChatStream] Starting stream:", streamId);

  // Ensure conversation exists
  const conversationId = await ctx.runMutation(internal.chat.ensureConversation, {
    notebookId: notebookIdTyped,
    userId,
  });

  // Get conversation history
  const { messages: messageList } = await ctx.runQuery(internal.chat.getMessagesInternal, {
    conversationId,
    limit: 20,
  });

  const conversationHistory = messageList
    .filter((m: any) => m.role !== "system")
    .map((m: any) => ({ role: m.role, content: m.content }));

  // Vector search runner using Convex
  const vectorSearchRunner = async (
    embedding: number[],
    limit: number,
    docIds?: string[]
  ): Promise<VectorSearchResult[]> => {
    // Fetch more results only if we have specific documents to search within
    // This ensures we get enough relevant chunks from the selected documents
    const limitToFetch = docIds?.length ? Math.max(limit * 3, 75) : limit;

    const allChunks = await ctx.runQuery(internal.documents.listChunksByNotebook, {
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
    const fullChunks = chunkIds.length > 0
      ? await ctx.runQuery(internal.documents.getChunks, { chunkIds })
      : [];

    const chunkMap = new Map<Id<"documentChunks">, DocumentChunkDoc>(
      (fullChunks as (DocumentChunkDoc | null)[])
        .filter((c: DocumentChunkDoc | null): c is DocumentChunkDoc => c !== null)
        .map((c: DocumentChunkDoc) => [c._id, c] as [Id<"documentChunks">, DocumentChunkDoc])
    );

    const rowsWithoutTitle: Omit<VectorSearchResult, "sourceTitle">[] = (results as VectorSearchHit[])
      .map((r: VectorSearchHit) => {
        const chunk = chunkMap.get(r._id);
        if (!chunk) return null;
        return {
          _id: r._id,
          _score: r._score ?? 0,
          documentId: chunk.documentId,
          notebookId: chunk.notebookId,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          embedding: chunk.embedding ?? [],
        };
      })
      .filter((r): r is Omit<VectorSearchResult, "sourceTitle"> => r !== null);

    const documentIds = [...new Set(rowsWithoutTitle.map((r) => r.documentId))];
    const docTitles = await ctx.runQuery(internal.documents.getDocumentsByIds, { documentIds }) as { _id: Id<"documents">; fileName: string }[];
    const titleMap = new Map<Id<"documents">, string>(docTitles.map((d: { _id: Id<"documents">; fileName: string }) => [d._id, d.fileName]));

    const rows: VectorSearchResult[] = rowsWithoutTitle.map((r) => ({
      ...r,
      sourceTitle: (titleMap.get(r.documentId) ?? "Document") as string,
    }));

    // Filter by threshold BEFORE applying documentIds filter
    // This ensures we only use high-quality matches
    console.log(`[vectorSearchRunner] Applying threshold filter: ${VECTOR_MATCH_THRESHOLD}`);
    let thresholded = rows.filter((r) => r._score >= VECTOR_MATCH_THRESHOLD);
    console.log(`[vectorSearchRunner] After threshold (${VECTOR_MATCH_THRESHOLD}): ${thresholded.length} results (from ${rows.length})`);

    // Log score distribution for debugging
    if (rows.length > 0) {
      const scores = rows.map(r => r._score);
      console.log(`[vectorSearchRunner] Score distribution: min=${Math.min(...scores).toFixed(3)}, max=${Math.max(...scores).toFixed(3)}, avg=${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(3)}`);
    }

    // Fallback: If no results pass threshold, progressively lower it
    if (thresholded.length === 0 && rows.length > 0) {
      const FALLBACK_THRESHOLDS = [0.35, 0.3, 0.25, 0.2];
      for (const fallbackThreshold of FALLBACK_THRESHOLDS) {
        thresholded = rows.filter((r) => r._score >= fallbackThreshold);
        if (thresholded.length > 0) {
          console.warn(`[vectorSearchRunner] No results at threshold ${VECTOR_MATCH_THRESHOLD}. Using fallback threshold ${fallbackThreshold}: ${thresholded.length} results`);
          break;
        }
      }
      // Last resort: return top results regardless of score
      if (thresholded.length === 0) {
        console.warn(`[vectorSearchRunner] No results even at lowest threshold. Returning top ${Math.min(limit, rows.length)} results regardless of score.`);
        thresholded = rows.slice(0, Math.min(limit, rows.length));
      }
    }

    // Then apply documentIds filter if provided
    if (docIds?.length) {
      const docIdSet = new Set(docIds);
      const filteredByDoc = thresholded.filter((r) => docIdSet.has(r.documentId));
      console.log(`[vectorSearchRunner] After documentIds filter: ${filteredByDoc.length} results`);
      // If we have very few results after filtering, try again without threshold but keep document filter
      if (filteredByDoc.length < 3 && thresholded.length >= 3) {
        console.warn(`[vectorSearchRunner] Only ${filteredByDoc.length} results from selected documents pass threshold. Using all thresholded results for better coverage.`);
        // Don't filter by docIds, use thresholded results instead
        return thresholded.slice(0, limit);
      }
      return filteredByDoc.slice(0, limit);
    }
    return thresholded.slice(0, limit);
  };

  // Keyword search runner using closure pattern (captures notebookIdTyped and userId)
  const keywordSearchRunner = async (
    query: string,
    limit: number,
    docIds?: string[]
  ): Promise<any[]> => {
    console.log("[keywordSearchRunner] executing with closure-captured context");

    const results = await ctx.runQuery(internal.documents.keywordSearch, {
      notebookId: notebookIdTyped,  // Captured from outer scope
      userId,                        // Captured from outer scope
      query,
      limit,
      documentIds: docIds as any,    // Cast for Convex Id type
    });

    console.log("[keywordSearchRunner] returned", results.length, "results");
    return results;
  };

  // Initialize HybridSearchHandler with both vector and keyword search
  const embeddingService = new EmbeddingService(process.env.OPENAI_API_KEY || "");
  const hybridSearch = new HybridSearchHandler(
    {
      vectorMatchThreshold: parseFloat(process.env.CHAT_VECTOR_MATCH_THRESHOLD ?? '0.3'),
      vectorMatchCount: parseInt(process.env.CHAT_VECTOR_MATCH_COUNT ?? '25', 10),
      rerankThreshold: parseInt(process.env.CHAT_RERANK_THRESHOLD ?? '5', 10),
      rerankTopN: parseInt(process.env.CHAT_RERANK_TOP_N ?? '15', 10),
      maxResults: parseInt(process.env.CHAT_MAX_RESULTS ?? '7', 10),
      keywordMatchCount: parseInt(process.env.CHAT_KEYWORD_MATCH_COUNT ?? '50', 10),
      rrfK: parseInt(process.env.CHAT_RRF_K ?? '60', 10),
      enableHybrid: process.env.CHAT_ENABLE_HYBRID_SEARCH !== 'false',
      hybridThreshold: parseFloat(process.env.CHAT_HYBRID_THRESHOLD ?? '0.3'),
    },
    embeddingService,
    vectorSearchRunner,
    keywordSearchRunner
  );

  const agent = new ChatAgent({ vectorSearchHandler: hybridSearch });

  let fullResponse = "";
  let references: unknown[] = [];
  let hasError = false;

  try {
    // Stream response chunks using ChatAgent
    for await (const chunk of agent.streamResponse({
      userId,
      noteId: notebookId,
      conversationHistory,
      documentIds,
    }, message)) {
      if (chunk.type === "token") {
        fullResponse += chunk.data ?? "";

        // Append token to persistent stream (appears immediately to client)
        await chunkAppender(chunk.data ?? "");
      } else if (chunk.type === "references") {
        references = chunk.data ?? [];

        // Append references as JSON metadata
        await chunkAppender(`\n__REFERENCES:${JSON.stringify(references)}\n`);
      } else if (chunk.type === "status") {
        // Append status as metadata
        await chunkAppender(`\n__STATUS:${chunk.status}:${chunk.message ?? ""}\n`);
      } else if (chunk.type === "grounding_check") {
        // Append grounding check as metadata
        await chunkAppender(`\n__GROUNDING:${JSON.stringify(chunk.data)}\n`);
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
    await chunkAppender(`\n__ERROR:${JSON.stringify({ message: error instanceof Error ? error.message : "Unknown error" })}\n`);
  }

  // Store final assistant message in database
  await ctx.runMutation(internal.chat.addMessage, {
    conversationId,
    role: "assistant",
    content: fullResponse,
    references,
  });

  console.log("[ChatStream] Stream complete:", streamId);

  return {
    fullResponse,
    references,
    hasError,
  };
}
