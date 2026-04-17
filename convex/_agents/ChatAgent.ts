"use node";
/**
 * Chat Agent Service
 *
 * Deterministic router → parallel sub-query retrieval (HyDE + hybrid, rerank once) → structured answer.
 */

import { env } from "../_lib/env";

import { VectorSearchHandler } from "./chat/vector_search.js";
import { ChatLLMWrapper, type ChatResponse } from "./chat/llm_wrapper.js";
import { validateGrounding, validateSemanticGrounding } from "./chat/grounding_validator.js";
import { EmbeddingService } from "../_services/processing/EmbeddingServiceClient";
import type { ReferenceChunk } from "../storage/ChatHistoryService";
import { budgetConversationHistory } from "./chat/chatHistoryBudget.js";
import { routeChatMessage } from "./chat/chatRouter.js";

// ============================================================
// Types
// ============================================================

export interface ChatAgentContext {
  userId: string;
  noteId: string;
  conversationHistory: Array<{ role: string; content: string }>;
  documentIds?: string[];
  /** Overrides env CHAT_GROUNDING_MODE when set */
  groundingMode?: "async" | "sync" | "off";
}

export interface StreamChunk {
  type:
    | "token"
    | "references"
    | "done"
    | "error"
    | "warning"
    | "grounding_check"
    | "grounding_warn"
    | "status"
    | "tool_call"
    | "followups"
    | "clarification";
  data?: any;
  status?: string;
  message?: string;
}

export type GlobalRerankFn = (
  query: string,
  documents: Array<{ id: string; content: string }>
) => Promise<Array<{ id: string; content: string; score?: number }>>;

export interface ChatAgentOptions {
  vectorSearchHandler?: VectorSearchHandler;
  /** Single cached rerank over merged candidates */
  globalRerankFn?: GlobalRerankFn;
}

// ============================================================
// Constants
// ============================================================

/** HyDE + embed + hybrid search must finish before Convex action limits kill the stream (client saw only `searching` then disconnect). */
const SEARCH_PIPELINE_TIMEOUT_MS = parseInt(
  process.env.CHAT_SEARCH_PIPELINE_TIMEOUT_MS ?? "70000",
  10
);
const FOLLOWUP_GENERATION_TIMEOUT_MS = parseInt(
  process.env.CHAT_FOLLOWUP_TIMEOUT_MS ?? "15000",
  10
);
const RESPONSE_GENERATION_TIMEOUT_MS = parseInt(
  process.env.CHAT_RESPONSE_TIMEOUT_MS ?? "90000",
  10
);
/** Chunks passed to the answer model and citation indices (after merge + rank). */
const MAX_CONTEXT_CHUNKS = parseInt(env.CHAT_MAX_CONTEXT_CHUNKS ?? "15", 10);

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function chunkDedupKey(c: ReferenceChunk): string {
  return `${c.sourceId}:${c.chunkIndex}`;
}

function mergeChunkScores(existing: ReferenceChunk, incoming: ReferenceChunk): ReferenceChunk {
  const pickMax = (a?: number, b?: number): number | undefined => {
    const hasA = a != null && !Number.isNaN(a);
    const hasB = b != null && !Number.isNaN(b);
    if (!hasA && !hasB) return undefined;
    return Math.max(hasA ? (a as number) : 0, hasB ? (b as number) : 0);
  };
  return {
    ...existing,
    similarity: pickMax(existing.similarity, incoming.similarity),
    rrfScore: pickMax(existing.rrfScore, incoming.rrfScore),
    sourceUrl: existing.sourceUrl ?? incoming.sourceUrl,
  };
}

function chunkRankingScore(c: ReferenceChunk): number {
  if (c.similarity != null && !Number.isNaN(c.similarity)) return c.similarity;
  if (c.rrfScore != null && !Number.isNaN(c.rrfScore)) return c.rrfScore;
  return 0;
}

function rankAndCapChunks(chunks: ReferenceChunk[], maxN: number): ReferenceChunk[] {
  const sorted = [...chunks].sort((a, b) => chunkRankingScore(b) - chunkRankingScore(a));
  return sorted.length <= maxN ? sorted : sorted.slice(0, maxN);
}

/** Smaller token yields so the HTTP stream and UI update more frequently than whole-paragraph chunks. */
const STREAM_TOKEN_SLICE_CHARS = parseInt(process.env.CHAT_STREAM_TOKEN_SLICE_CHARS ?? "480", 10);
const STREAM_TOKEN_DELAY_MS = parseInt(process.env.CHAT_STREAM_TOKEN_DELAY_MS ?? "12", 10);

async function* sliceParagraphForStream(para: string): AsyncGenerator<string> {
  const trimmed = para.trim();
  if (!trimmed) return;
  const max = Math.max(120, STREAM_TOKEN_SLICE_CHARS);
  if (trimmed.length <= max) {
    yield trimmed + "\n\n";
    return;
  }
  let i = 0;
  while (i < trimmed.length) {
    let end = Math.min(i + max, trimmed.length);
    if (end < trimmed.length) {
      const sp = trimmed.lastIndexOf(" ", end);
      if (sp > i + 48) end = sp + 1;
    }
    const part = trimmed.slice(i, end).trimEnd();
    if (part) {
      yield part + (end >= trimmed.length ? "\n\n" : "");
    }
    i = end;
  }
}

/**
 * Expand query with keyword-based variations (no LLM overhead, ~10ms latency)
 * Helps find content when user's terminology doesn't match document terminology
 */
function expandQueryWithKeywords(query: string): string[] {
  const variations = [query];
  const lowerQuery = query.toLowerCase();

  // Domain-independent term mappings
  const termVariations: Record<string, string[]> = {
    // Comparison/contrast terms
    difference: ["compare", "contrast", "vs", "versus", "comparison"],
    "how does it work": ["mechanism", "algorithm", "process", "methodology", "approach"],
    advantages: ["benefits", "pros", "strengths"],
    disadvantages: ["drawbacks", "cons", "weaknesses", "limitations"],
    example: ["instance", "case", "illustration"],

    // Common academic/technical variations
    definition: ["define", "meaning", "what is", "what are"],
    explain: ["describe", "elaborate", "clarify"],
    overview: ["summary", "introduction", "background"],
    purpose: ["goal", "objective", "aim", "function"],
    result: ["outcome", "output", "consequence", "effect"],
  };

  // Apply variations (limit to avoid too many search calls)
  let variationCount = 0;
  const maxVariations = 2;

  for (const [term, synonyms] of Object.entries(termVariations)) {
    if (lowerQuery.includes(term) && variationCount < maxVariations) {
      for (const synonym of synonyms.slice(0, 2)) {
        if (variationCount >= maxVariations) break;

        // Create variation by replacing the term
        const regex = new RegExp(term, "gi");
        const variation = query.replace(regex, synonym);
        if (variation !== query) {
          variations.push(variation);
          variationCount++;
        }
      }
    }
  }

  return variations.slice(0, 3); // Limit to 3 total variations (original + 2)
}

// ============================================================
// Chat Agent Service
// ============================================================

export class ChatAgent {
  private llmWrapper: ChatLLMWrapper;
  private vectorSearch: VectorSearchHandler;
  private embeddingService: EmbeddingService;
  private globalRerankFn?: GlobalRerankFn;

  constructor(options?: ChatAgentOptions) {
    this.llmWrapper = new ChatLLMWrapper({
      apiKey: env.TOGETHER_AI_API_KEY,
      model: env.SMART_LLM || "openai/gpt-oss-120b",
      temperature: parseFloat(env.CHAT_LLM_TEMPERATURE ?? "0.1"),
      fastModel: env.FAST_LLM,
      fastApiKey: env.TOGETHER_AI_API_KEY,
    });

    this.vectorSearch =
      options?.vectorSearchHandler ??
      new VectorSearchHandler({
        vectorMatchThreshold: parseFloat(env.CHAT_VECTOR_MATCH_THRESHOLD ?? "0.3"),
        vectorMatchCount: parseInt(env.CHAT_VECTOR_MATCH_COUNT ?? "25", 10),
        rerankThreshold: parseInt(env.CHAT_RERANK_THRESHOLD ?? "5", 10),
        rerankTopN: parseInt(env.CHAT_RERANK_TOP_N ?? "15", 10),
        maxResults: parseInt(env.CHAT_MAX_RESULTS ?? "7", 10),
      });

    this.embeddingService = new EmbeddingService(env.OPENAI_API_KEY);
    this.globalRerankFn = options?.globalRerankFn;
  }

  private resolveGroundingMode(context: ChatAgentContext): "async" | "sync" | "off" {
    if (context.groundingMode) return context.groundingMode;
    const m = env.CHAT_GROUNDING_MODE;
    if (m === "sync" || m === "off") return m;
    return "async";
  }

  /**
   * HyDE + hybrid search for one sub-query; rerank skipped (merged + global rerank later).
   */
  private async runSubqueryRetrieval(
    query: string,
    context: ChatAgentContext,
    userMessage: string
  ): Promise<ReferenceChunk[]> {
    const pipelineDeadline = Date.now() + SEARCH_PIPELINE_TIMEOUT_MS;
    const remainingMs = () => {
      const ms = pipelineDeadline - Date.now();
      if (ms <= 0) {
        throw new Error(`search_pipeline timed out after ${SEARCH_PIPELINE_TIMEOUT_MS}ms`);
      }
      return ms;
    };

    const searchOpts = { skipRerank: true, allowEmpty: true } as const;

    const hydeText = await withTimeout(
      this.llmWrapper.generateHypotheticalDocument(query),
      remainingMs(),
      "hyde_generation"
    );
    const textForVectorEmbedding = [query.trim(), hydeText.trim()].filter(Boolean).join("\n\n");
    const hydeEmbedding = await withTimeout(
      this.embeddingService.embedText(textForVectorEmbedding),
      remainingMs(),
      "hyde_embedding"
    );

    if (context.documentIds?.length) {
      const expandedQueries = expandQueryWithKeywords(query);
      const allResults: ReferenceChunk[] = [];
      const seenChunkKeys = new Set<string>();

      for (const queryVariation of expandedQueries) {
        const variationResults = await withTimeout(
          this.vectorSearch.search(
            context.userId,
            context.noteId,
            queryVariation,
            context.documentIds,
            hydeEmbedding,
            hydeText,
            searchOpts
          ),
          remainingMs(),
          "vector_hybrid_search"
        );
        for (const chunk of variationResults) {
          const key = chunkDedupKey(chunk);
          if (!seenChunkKeys.has(key)) {
            allResults.push(chunk);
            seenChunkKeys.add(key);
          }
        }
      }
      return allResults;
    }

    return await withTimeout(
      this.vectorSearch.search(
        context.userId,
        context.noteId,
        query,
        context.documentIds,
        hydeEmbedding,
        hydeText,
        searchOpts
      ),
      remainingMs(),
      "vector_hybrid_search"
    );
  }

  private async applyGlobalRerank(
    merged: ReferenceChunk[],
    rerankQueryFromDecomposer: string | undefined,
    userMessage: string
  ): Promise<ReferenceChunk[]> {
    if (!this.globalRerankFn || merged.length === 0) {
      return merged;
    }
    // Single source of truth for cachedRerank query string (see plan: parallel-rag todo).
    const rerankQueryForCache =
      (rerankQueryFromDecomposer?.trim() && rerankQueryFromDecomposer.trim()) || userMessage;

    const docs = merged.map((c) => ({
      id: `${c.sourceId}:${c.chunkIndex}`,
      content: c.content,
    }));

    const reranked = await this.globalRerankFn(rerankQueryForCache, docs);
    const order = new Map(reranked.map((d, i) => [d.id, i]));
    const scoreMap = new Map(reranked.map((d) => [d.id, d.score]));

    const sorted = [...merged].sort((a, b) => {
      const ida = `${a.sourceId}:${a.chunkIndex}`;
      const idb = `${b.sourceId}:${b.chunkIndex}`;
      const ia = order.has(ida) ? (order.get(ida) as number) : 9999;
      const ib = order.has(idb) ? (order.get(idb) as number) : 9999;
      if (ia !== ib) return ia - ib;
      return chunkRankingScore(b) - chunkRankingScore(a);
    });

    return sorted.map((c) => {
      const id = `${c.sourceId}:${c.chunkIndex}`;
      const sc = scoreMap.get(id);
      if (sc != null && !Number.isNaN(sc)) {
        return { ...c, similarity: sc };
      }
      return c;
    });
  }

  async *streamResponse(
    context: ChatAgentContext,
    userMessage: string
  ): AsyncGenerator<StreamChunk> {
    console.log("[ChatAgent] ========== STREAM START ==========");
    console.log(`[ChatAgent] User message: "${userMessage}"`);

    try {
      const historyBudget = parseInt(env.CHAT_HISTORY_TOKEN_BUDGET ?? "4000", 10);
      const recentTurns = budgetConversationHistory(context.conversationHistory, historyBudget);

      yield* this.streamRoutedResponse(context, userMessage, recentTurns);
    } catch (error) {
      console.error("[ChatAgent] ========== ERROR ==========", error);

      let errorMessage = "Unknown error occurred";
      let errorType = "unknown";

      if (error instanceof Error) {
        errorMessage = error.message;
        if (
          error.message.includes("No results found") ||
          error.message.includes("No relevant documents")
        ) {
          errorType = "no_documents";
        } else if (
          error.message.includes("Vector search failed") ||
          error.message.includes("Hybrid search failed")
        ) {
          errorType = "search_failed";
        } else if (error.message.includes("API key")) {
          errorType = "api_error";
        } else if (error.message.includes("Invalid document ID")) {
          errorType = "validation_error";
        } else if (error.message.includes("timed out")) {
          errorType = "timeout";
        }
      }

      yield { type: "error", data: { message: errorMessage, type: errorType } };
    }
  }

  private async *streamRoutedResponse(
    context: ChatAgentContext,
    userMessage: string,
    recentTurns: Array<{ role: string; content: string }>
  ): AsyncGenerator<StreamChunk> {
    const route = routeChatMessage(userMessage, recentTurns);

    if (route.type === "clarify") {
      yield { type: "clarification", data: { question: route.question } };
      yield { type: "done" };
      console.log("[ChatAgent] ========== STREAM COMPLETE (router clarify) ==========");
      return;
    }

    if (route.type === "direct") {
      console.log("[ChatAgent] Router: direct response");
      yield { type: "status", status: "thinking", message: "Generating response..." };
      const directAnswer = await this.llmWrapper.generateDirectResponse(userMessage, recentTurns);
      for (const para of directAnswer.split(/\n\n+/)) {
        if (para.trim().length > 0) {
          for await (const piece of sliceParagraphForStream(para)) {
            yield { type: "token", data: piece };
            await new Promise((resolve) => setTimeout(resolve, STREAM_TOKEN_DELAY_MS));
          }
        }
      }
      yield { type: "done" };
      console.log("[ChatAgent] ========== STREAM COMPLETE (direct) ==========");
      return;
    }

    console.log("[ChatAgent] Router: retrieve (parallel sub-queries)");
    yield { type: "status", status: "planning", message: "Planning searches…" };

    const { subqueries, rerankQuery: rerankQueryOpt } =
      await this.llmWrapper.generateRetrievalSubqueries(userMessage, recentTurns);

    const allChunks: ReferenceChunk[] = [];

    yield { type: "status", status: "retrieving", message: "Searching your materials…" };

    const settled = await Promise.allSettled(
      subqueries.map((sq) => this.runSubqueryRetrieval(sq, context, userMessage))
    );

    for (let i = 0; i < settled.length; i++) {
      const sq = subqueries[i];
      const r = settled[i];
      yield {
        type: "tool_call",
        data: { tool: "search_documents", query: sq, status: "searching" },
      };
      if (r.status === "fulfilled") {
        for (const chunk of r.value) {
          const key = chunkDedupKey(chunk);
          const idx = allChunks.findIndex((c) => chunkDedupKey(c) === key);
          if (idx < 0) {
            allChunks.push(chunk);
          } else {
            allChunks[idx] = mergeChunkScores(allChunks[idx], chunk);
          }
        }
        yield {
          type: "tool_call",
          data: {
            tool: "search_documents",
            query: sq,
            status: "done",
            resultCount: r.value.length,
          },
        };
      } else {
        console.warn(`[ChatAgent] Subquery search failed for "${sq}":`, r.reason);
        yield {
          type: "tool_call",
          data: { tool: "search_documents", query: sq, status: "done", resultCount: 0 },
        };
      }
    }

    let merged = allChunks;
    try {
      merged = await this.applyGlobalRerank(allChunks, rerankQueryOpt, userMessage);
    } catch (e) {
      console.warn("[ChatAgent] Global rerank failed, using merged hybrid scores:", e);
    }

    const rankedChunks = rankAndCapChunks(merged, MAX_CONTEXT_CHUNKS);
    if (rankedChunks.length < merged.length) {
      console.log(
        `[ChatAgent] Capped context: ${merged.length} merged chunks → top ${rankedChunks.length} for generation`
      );
    }

    if (rankedChunks.length === 0) {
      console.log("[ChatAgent] No chunks — streaming direct response");
      yield { type: "status", status: "thinking", message: "Generating response..." };
      const directAnswer = await this.llmWrapper.generateDirectResponse(userMessage, recentTurns);
      for (const para of directAnswer.split(/\n\n+/)) {
        if (para.trim().length > 0) {
          for await (const piece of sliceParagraphForStream(para)) {
            yield { type: "token", data: piece };
            await new Promise((resolve) => setTimeout(resolve, STREAM_TOKEN_DELAY_MS));
          }
        }
      }
      yield { type: "done" };
      console.log("[ChatAgent] ========== STREAM COMPLETE (direct, no retrieval) ==========");
      return;
    }

    yield* this.streamRagAnswerFromChunks(context, userMessage, recentTurns, rankedChunks);
  }

  private async *streamRagAnswerFromChunks(
    context: ChatAgentContext,
    userMessage: string,
    recentTurns: Array<{ role: string; content: string }>,
    allChunks: ReferenceChunk[]
  ): AsyncGenerator<StreamChunk> {
    const mode = this.resolveGroundingMode(context);

    yield { type: "status", status: "reading", message: `Reading ${allChunks.length} passages...` };
    yield { type: "references", data: allChunks };

    console.log("[ChatAgent] Phase 2: Generating grounded response");
    yield { type: "status", status: "thinking", message: "Formulating answer..." };

    let structuredResponse: ChatResponse = await withTimeout(
      this.llmWrapper.generateStructuredResponse(allChunks, userMessage, recentTurns),
      RESPONSE_GENERATION_TIMEOUT_MS,
      "response_generation"
    );

    let isGrounded = true;
    let semanticOnlyFailure = false;
    let semanticValidation: {
      isGrounded: boolean;
      issues: string[];
      missingCitations: boolean;
    } = {
      isGrounded: true,
      issues: [],
      missingCitations: false,
    };

    if (mode === "sync") {
      console.log("[ChatAgent] Phase 3: Validating grounding (sync)");
      const syntacticValidation = validateGrounding(structuredResponse.answer_markdown, allChunks);
      semanticValidation = syntacticValidation.isGrounded
        ? await validateSemanticGrounding(
            structuredResponse.answer_markdown,
            allChunks,
            this.embeddingService
          )
        : { isGrounded: false, issues: [], missingCitations: false };

      isGrounded = syntacticValidation.isGrounded && semanticValidation.isGrounded;

      if (!isGrounded) {
        if (syntacticValidation.isGrounded && !semanticValidation.isGrounded) {
          semanticOnlyFailure = true;
          console.warn(
            "[ChatAgent] Semantic grounding below threshold — keeping first response (no strict retry):",
            semanticValidation.issues
          );
        } else {
          console.warn("[ChatAgent] Grounding failed — retrying with strict grounding");
          structuredResponse = await withTimeout(
            this.llmWrapper.generateWithStrictGrounding(allChunks, userMessage, recentTurns),
            RESPONSE_GENERATION_TIMEOUT_MS,
            "strict_grounding_retry"
          );

          const retrySyntactic = validateGrounding(structuredResponse.answer_markdown, allChunks);
          const retrySemantic = retrySyntactic.isGrounded
            ? await validateSemanticGrounding(
                structuredResponse.answer_markdown,
                allChunks,
                this.embeddingService
              )
            : { isGrounded: false, issues: [], missingCitations: false };
          isGrounded = retrySyntactic.isGrounded && retrySemantic.isGrounded;
          semanticValidation = retrySemantic;
          semanticOnlyFailure = retrySyntactic.isGrounded && !retrySemantic.isGrounded;
        }
      }
    }

    yield { type: "status", status: "generating", message: "Generating response..." };
    const finalText = structuredResponse.answer_markdown;

    if (mode === "async") {
      const groundingPromise = (async () => {
        const syn = validateGrounding(structuredResponse.answer_markdown, allChunks);
        const sem = syn.isGrounded
          ? await validateSemanticGrounding(
              structuredResponse.answer_markdown,
              allChunks,
              this.embeddingService
            )
          : { isGrounded: false, issues: [] as string[], missingCitations: false };
        const g = syn.isGrounded && sem.isGrounded;
        const semOnly = syn.isGrounded && !sem.isGrounded;
        return { sem, isGrounded: g, semanticOnlyFailure: semOnly };
      })();

      for (const para of finalText.split(/\n\n+/)) {
        if (para.trim().length > 0) {
          for await (const piece of sliceParagraphForStream(para)) {
            yield { type: "token", data: piece };
            await new Promise((resolve) => setTimeout(resolve, STREAM_TOKEN_DELAY_MS));
          }
        }
      }

      const g = await groundingPromise;
      isGrounded = g.isGrounded;
      semanticOnlyFailure = g.semanticOnlyFailure;

      if (!isGrounded) {
        const syntacticIssues = validateGrounding(
          structuredResponse.answer_markdown,
          allChunks
        ).issues;
        const allIssues = semanticOnlyFailure
          ? [...g.sem.issues, ...syntacticIssues]
          : syntacticIssues;
        yield {
          type: "grounding_warn",
          data: {
            passed: false,
            issues: allIssues,
            message: semanticOnlyFailure
              ? "Note: Automated check suggests the answer may be only loosely aligned with cited passages"
              : "Note: This response may not be fully grounded in your documents",
          },
        };
      }
    } else {
      for (const para of finalText.split(/\n\n+/)) {
        if (para.trim().length > 0) {
          for await (const piece of sliceParagraphForStream(para)) {
            yield { type: "token", data: piece };
            await new Promise((resolve) => setTimeout(resolve, STREAM_TOKEN_DELAY_MS));
          }
        }
      }

      if (mode === "sync" && !isGrounded) {
        const syntacticIssues = validateGrounding(
          structuredResponse.answer_markdown,
          allChunks
        ).issues;
        const allIssues = semanticOnlyFailure
          ? [...semanticValidation.issues, ...syntacticIssues]
          : syntacticIssues;
        yield {
          type: "grounding_check",
          data: {
            passed: false,
            issues: allIssues,
            message: semanticOnlyFailure
              ? "Note: Automated check suggests the answer may be only loosely aligned with cited passages"
              : "Note: This response may not be fully grounded in your documents",
          },
        };
      }
    }

    if (structuredResponse.confidence !== "high") {
      yield {
        type: "grounding_check",
        data: {
          passed: structuredResponse.confidence !== "low",
          issues:
            structuredResponse.confidence === "low" ? ["Low confidence in source coverage"] : [],
          message: `Response confidence: ${structuredResponse.confidence}`,
        },
      };
    }

    let followUps: string[] = [];
    try {
      followUps = await withTimeout(
        this.llmWrapper.generateFollowUpQuestions(userMessage, finalText),
        FOLLOWUP_GENERATION_TIMEOUT_MS,
        "follow_up_questions"
      );
    } catch (e) {
      console.warn("[ChatAgent] Follow-up generation timed out or failed:", e);
    }
    if (followUps.length > 0) {
      yield { type: "followups", data: followUps };
    }

    yield { type: "done" };

    console.log("[ChatAgent] ========== STREAM COMPLETE ==========");
  }
}
