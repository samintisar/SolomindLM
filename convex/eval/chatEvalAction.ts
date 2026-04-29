/**
 * Convex action for running the ChatAgent in eval mode.
 *
 * Constructs a ChatAgent with the same production services but wraps
 * globalRerankFn to capture pre/post-rerank intermediate state.
 * Consumes the full async generator to collect answer, references,
 * subqueries, and timing data.
 *
 * SECURITY: Intended for dev tooling only. Gated by RAG_EVALS_ENABLED +
 * RAG_EVAL_SECRET in Convex env. Identity is derived from the target
 * notebook's owner — the action does NOT trust a caller-supplied userId,
 * so a leaked secret cannot be used to impersonate arbitrary users.
 */
"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { ChatAgent, type GlobalRerankFn } from "../_agents/ChatAgent";
import { HybridSearchHandler } from "../_agents/chat/hybrid_search.js";
import { cachedRerank, RerankDocument } from "../_agents/chat/rerankCache.js";
import { EmbeddingService } from "../_services/processing/EmbeddingServiceClient";
import { env } from "../_lib/env";
import type { ReferenceChunk } from "../storage/ChatHistoryService";
import type { VectorSearchRawResult } from "../_agents/chat/vector_search";

// ─── Types ───────────────────────────────────────────────────

export const chatEvalActionArgs = {
  evalSecret: v.string(),
  question: v.string(),
  notebookId: v.id("notebooks"),
  documentIds: v.optional(v.array(v.id("documents"))),
};

export interface ChatEvalResult {
  answer: string;
  citations: string[];
  subQueries: string[];
  preRerankChunks: ReferenceChunk[];
  postRerankChunks: ReferenceChunk[];
  selectedChunks: ReferenceChunk[];
  latencyMs: number;
  tokenUsage?: { prompt: number; completion: number; total: number };
}

interface VectorSearchHit {
  _id: Id<"documentChunks">;
  _score: number;
}

function assertRagEvalGate(evalSecret: string): void {
  if (process.env.RAG_EVALS_ENABLED !== "true") {
    throw new Error("RAG evals are disabled (set RAG_EVALS_ENABLED=true on this deployment to enable).");
  }
  const expected = process.env.RAG_EVAL_SECRET ?? "";
  if (!expected || expected.length < 16) {
    throw new Error("RAG_EVAL_SECRET must be set to a strong value (min 16 chars) on this deployment.");
  }
  if (evalSecret.length !== expected.length) {
    throw new Error("Invalid eval credentials.");
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= evalSecret.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) {
    throw new Error("Invalid eval credentials.");
  }
}

// ─── Action ──────────────────────────────────────────────────

export const runChatEval = action({
  args: chatEvalActionArgs,
  handler: async (ctx, args): Promise<ChatEvalResult> => {
    assertRagEvalGate(args.evalSecret);

    const startTime = Date.now();
    const notebookIdTyped = args.notebookId;

    // Identity is the notebook owner — secret-holder cannot impersonate
    // arbitrary users by passing a userId.
    const notebook = await ctx.runQuery(internal.notebooks.index.getNotebookInternal, {
      notebookId: notebookIdTyped,
    });
    if (!notebook) {
      throw new Error(
        `Notebook ${notebookIdTyped} not found on this Convex deployment. ` +
          `Verify RAG_EVAL_CONVEX_URL points at the deployment that owns this notebook ` +
          `(IDs do not transfer across deployments).`
      );
    }
    const evalUserId = notebook.userId as Id<"users">;
    const keywordSearchChunkUserId = evalUserId;

    const documentIdStrings = args.documentIds as Id<"documents">[] | undefined;

    // ── Vector search runner (matches convex/chat/stream.ts) ──

    const vectorSearchRunner = async (
      embedding: number[],
      limit: number,
      docIds?: string[]
    ): Promise<VectorSearchRawResult[]> => {
      const limitToFetch = docIds?.length ? Math.max(limit * 3, 75) : limit;

      const results = await ctx.vectorSearch("documentChunks", "by_embedding", {
        vector: embedding,
        limit: limitToFetch,
        filter: (q) => q.eq("notebookId", notebookIdTyped),
      });

      const chunkIds = (results as VectorSearchHit[]).map((r) => r._id);
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

      const rows: VectorSearchRawResult[] = [];
      for (const r of results as VectorSearchHit[]) {
        const chunk = chunkMap.get(r._id);
        if (!chunk) continue;

        // Filter by document IDs if specified
        if (docIdSet && !docIdSet.has(chunk.documentId as Id<"documents">)) continue;
        // Apply threshold
        const threshold = docIdSet ? VECTOR_MATCH_THRESHOLD * 0.5 : VECTOR_MATCH_THRESHOLD;
        if (r._score < threshold) continue;

        rows.push({
          _id: r._id,
          _score: r._score,
          content: chunk.content as string,
          chunkIndex: chunk.chunkIndex as number,
          documentId: chunk.documentId as Id<"documents">,
          sourceTitle: "",
          sourceUrl: "",
        });
      }
      return rows.slice(0, limit);
    };

    // ── Keyword search runner ──

    const keywordSearchRunner = async (query: string, limit: number, docIds?: string[]) => {
      return ctx.runQuery(internal.documents.index.keywordSearch, {
        notebookId: notebookIdTyped,
        userId: keywordSearchChunkUserId,
        query,
        limit,
        documentIds: docIds as Id<"documents">[] | undefined,
      });
    };

    // ── Services ──

    const embeddingService = new EmbeddingService(process.env.TOGETHER_AI_API_KEY || "");

    const rerankFn = async (
      query: string,
      documents: Array<{ id: string; content: string }>
    ) => {
      return cachedRerank(ctx, query, documents as RerankDocument[], "zerank-2", 15);
    };

    // ── Spy wrapper for globalRerankFn ──

    let capturedPreRerankDocs: Array<{ id: string; content: string }> = [];
    let capturedRerankOutput: Array<{ id: string; content: string; score?: number }> = [];

    const spyGlobalRerankFn: GlobalRerankFn = async (query, documents) => {
      capturedPreRerankDocs = [...documents];
      const result = await rerankFn(query, documents);
      capturedRerankOutput = result;
      return result;
    };

    // ── Construct agent ──

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
      globalRerankFn: spyGlobalRerankFn,
    });

    // ── Consume the full generator stream ──

    let answer = "";
    let references: ReferenceChunk[] = [];
    const subQueries: string[] = [];

    const userIdStr = evalUserId as string;
    const notebookIdStr = args.notebookId as string;

    for await (const chunk of agent.streamResponse(
      {
        userId: userIdStr,
        noteId: notebookIdStr,
        conversationHistory: [],
        documentIds: documentIdStrings,
        enableNotebookSearch: true,
      },
      args.question,
      `eval-${Date.now()}`
    )) {
      switch (chunk.type) {
        case "token":
          answer += chunk.data ?? "";
          break;
        case "references":
          references = chunk.data ?? [];
          break;
        case "tool_call": {
          const tc = chunk.data as { tool?: string; query?: string; status?: string };
          if (tc?.query && tc?.status === "searching") {
            subQueries.push(tc.query);
          }
          break;
        }
        case "error": {
          // Surface as a thrown error so eval scoring never runs against a
          // truncated answer. Without this, the loop would complete normally
          // and return partial output with a computed latency.
          const msg =
            (chunk as { message?: string }).message ??
            (typeof chunk.data === "string" ? chunk.data : "Agent stream emitted error chunk");
          throw new Error(`Agent stream error: ${msg}`);
        }
        case "done":
        case "warning":
        case "grounding_check":
        case "grounding_warn":
        case "status":
        case "followups":
        case "clarification":
          // Non-terminal informational chunks; not needed for eval artifacts.
          break;
      }
    }

    // ── Reconstruct pre/post-rerank chunks ──

    const preRerankChunks: ReferenceChunk[] = capturedPreRerankDocs.map((doc, i) => ({
      id: doc.id,
      sourceId: doc.id.split(":")[0],
      sourceTitle: "",
      content: doc.content,
      chunkIndex: i,
    }));

    const rerankOrder = new Map(capturedRerankOutput.map((d, i) => [d.id, i]));
    const rerankScores = new Map(capturedRerankOutput.map((d) => [d.id, d.score]));
    const postRerankChunks: ReferenceChunk[] = [...preRerankChunks]
      .sort((a, b) => {
        const oa = rerankOrder.get(a.id) ?? 9999;
        const ob = rerankOrder.get(b.id) ?? 9999;
        return oa - ob;
      })
      .map((c) => ({
        ...c,
        similarity: rerankScores.get(c.id),
      }));

    // Selected chunks = references from the stream
    const selectedChunks = references;

    // Extract citations from markdown (e.g. [1], [2])
    const citationPattern = /\[(\d+)\]/g;
    const citationSet = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = citationPattern.exec(answer)) !== null) {
      const idx = parseInt(match[1], 10);
      if (idx >= 1 && idx <= selectedChunks.length) {
        citationSet.add(selectedChunks[idx - 1].id);
      }
    }

    return {
      answer,
      citations: Array.from(citationSet),
      subQueries,
      preRerankChunks,
      postRerankChunks,
      selectedChunks,
      latencyMs: Date.now() - startTime,
    };
  },
});
