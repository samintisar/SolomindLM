"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id, Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { PersistentTextStreaming } from "@convex-dev/persistent-text-streaming";
import { ChatAgent } from "../lib/services/agents/ChatAgent";
import { VectorSearchHandler } from "../lib/services/agents/chat/vector-search";
import { EmbeddingService } from "../lib/services/processing/EmbeddingServiceClient";

interface VectorSearchResult {
  _id: Id<"documentChunks">;
  _score: number;
  documentId: Id<"documents">;
  notebookId: Id<"notebooks">;
  chunkIndex: number;
  content: string;
  embedding: number[];
}

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
    const limitToFetch = docIds?.length ? Math.max(limit * 4, 100) : limit;

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
        .map((c: DocumentChunkDoc) => [c._id, c])
    );

    const rows: VectorSearchResult[] = (results as VectorSearchHit[])
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
      .filter((r: VectorSearchResult | null): r is VectorSearchResult => r !== null);

    if (docIds?.length) {
      const docIdSet = new Set(docIds);
      return rows.filter((r) => docIdSet.has(r.documentId)).slice(0, limit);
    }
    return rows;
  };

  // Initialize ChatAgent with vector search
  const embeddingService = new EmbeddingService(process.env.OPENAI_API_KEY || "");
  const vectorSearch = new VectorSearchHandler(
    {
      vectorMatchThreshold: parseFloat(process.env.CHAT_VECTOR_MATCH_THRESHOLD ?? '0.3'),
      vectorMatchCount: parseInt(process.env.CHAT_VECTOR_MATCH_COUNT ?? '25', 10),
      rerankThreshold: parseInt(process.env.CHAT_RERANK_THRESHOLD ?? '5', 10),
      rerankTopN: parseInt(process.env.CHAT_RERANK_TOP_N ?? '15', 10),
      maxResults: parseInt(process.env.CHAT_MAX_RESULTS ?? '7', 10),
    },
    embeddingService,
    vectorSearchRunner
  );

  const agent = new ChatAgent({ vectorSearchHandler: vectorSearch });

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
