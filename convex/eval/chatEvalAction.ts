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

import { v } from "convex/values";
import { VALID_LANGUAGE_CODES } from "../_agents/_shared/languageInstruction";
import type { AgentStageSpan } from "../_agents/_shared/stageSpans";
import type { CallCounters } from "../_agents/_shared/tokenUsageAccumulator";
import { ChatAgent, type GlobalRerankFn } from "../_agents/ChatAgent";
import { isListEnumerationQuery } from "../_agents/chat/chat_retrieval_subqueries";
import {
  type ChatConfigOverrides,
  chatConfigOverridesValidator,
  resolveChatConfig,
} from "../_agents/chat/chatConfigOverrides";
import { budgetConversationHistory } from "../_agents/chat/chatHistoryBudget";
import { HybridSearchHandler } from "../_agents/chat/hybrid_search.js";
import { refineWebSearchQuery } from "../_agents/chat/searchQueryRefiner";
import type { ChatAgentContext, ReferenceChunk } from "../_agents/chat/types";
import type { VectorSearchRawResult } from "../_agents/chat/vector_search";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { type ActionCtx, action } from "../_generated/server";
import { env } from "../_lib/env";
import { createServiceLogger } from "../_lib/logging/serviceLogger";
import {
  AVAILABLE_SMART_MODEL_IDS,
  resolveSmartModel,
  type SmartModelId,
} from "../_lib/resolveSmartModel";
import { EmbeddingService } from "../_services/ai/embeddingClient";
import {
  createChatVectorSearchRunner,
  createFetchDocumentFn,
  createFetchDocumentTitlesFn,
  createFetchOpeningPassagesFn,
  createRerankFn,
} from "../chat/_streamSearch";
import { discoverChatExternalSources } from "../chat/_streamSources";
import { assertRagEvalGate } from "./_gate";
import { buildChatEvalTelemetry } from "./chatEvalTelemetry";
import { createRetrieveClock } from "./retrieveClock";

// ─── Types ───────────────────────────────────────────────────

export const chatEvalActionArgs = {
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
  /** Stop after context selection: no answer is generated (retrieval-only sweeps). */
  retrievalOnly: v.optional(v.boolean()),
  /** Prior turns before `question`, oldest first (the question is not included). */
  conversationHistory: v.optional(
    v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
      })
    )
  ),
  chatSettings: v.optional(
    v.object({
      instructionMode: v.optional(v.union(v.literal("default"), v.literal("learningGuide"))),
    })
  ),
  /** Smart model id (production: the notebook's chat model). Unlisted ids are refused. */
  smartModel: v.optional(v.string()),
  /** BCP-47 output language code (production: the user's preference). Unsupported codes are refused. */
  outputLanguage: v.optional(v.string()),
  /** Notebook custom instructions (production: notebook chatSettings.customInstructions, custom mode). */
  notebookInstructions: v.optional(v.string()),
  /** Chat knobs to change from production for this run (`--chat-config` in the eval CLI). */
  configOverrides: v.optional(chatConfigOverridesValidator),
};

export type EvalHistoryTurn = { role: "user" | "assistant"; content: string };

/**
 * The history the agent receives, built as production builds it (`chat/_streamChatResponse.ts`):
 * the conversation so far with the current user message last, trimmed to the history token budget.
 */
export function evalConversationHistory(
  question: string,
  priorTurns: EvalHistoryTurn[] | undefined,
  historyTokenBudget: number
): EvalHistoryTurn[] {
  const full: EvalHistoryTurn[] = [...(priorTurns ?? []), { role: "user", content: question }];
  // budgetConversationHistory returns a subset of its input, so every role is still user or assistant.
  return budgetConversationHistory(full, historyTokenBudget) as EvalHistoryTurn[];
}

/**
 * Chat settings the agent runs with, shaped as production's `mergedChatSettings`. Notebook
 * instructions make the notebook's mode custom, as the notebook settings do in production.
 */
export function evalChatSettings(
  instructionMode: "default" | "learningGuide" | undefined,
  notebookInstructions?: string
): NonNullable<ChatAgentContext["chatSettings"]> {
  const instructions = notebookInstructions?.trim();
  if (instructions) {
    if (instructionMode === "learningGuide") {
      throw new Error("notebookInstructions cannot be combined with learningGuide mode.");
    }
    return {
      instructionMode: "custom",
      customInstructions: instructions,
      responseLength: "default",
    };
  }
  return { instructionMode: instructionMode ?? "default", responseLength: "default" };
}

/**
 * The smart model an eval asks for, validated. Production resolves the notebook's choice with
 * `resolveSmartModel`, which falls back silently; an eval must not, so an unlisted model is an error.
 */
export function evalSmartModel(candidate: string | undefined): SmartModelId | undefined {
  if (candidate === undefined) return undefined;
  const resolved = resolveSmartModel(candidate);
  if (resolved !== candidate) {
    throw new Error(
      `Unknown or retired smart model "${candidate}". Use one of: ${AVAILABLE_SMART_MODEL_IDS.join(", ")}`
    );
  }
  return resolved;
}

/** Production caps external sources at five (`chat/_streamSources.ts`); the merged list keeps that cap. */
const EXTERNAL_SOURCE_CAP = 5;

/**
 * The external chunks the agent gets: production discovery and eval finance, merged, best first by
 * score (`similarity`, the score slot the chunks carry), capped at production's five.
 */
export function mergeExternalChunks(
  production: ReferenceChunk[],
  finance: ReferenceChunk[]
): ReferenceChunk[] {
  return [...production, ...finance]
    .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
    .slice(0, EXTERNAL_SOURCE_CAP);
}

/**
 * Eval-only finance search (Tavily, finance topic). Not production: production chat has no finance
 * channel. Failures return no chunks, as production's discovery does for its channels.
 */
async function evalFinanceChunks(ctx: ActionCtx, question: string): Promise<ReferenceChunk[]> {
  try {
    const refinedQuery = await refineWebSearchQuery(question);
    const results: Array<{ title?: string; url?: string; snippet?: string; content?: string }> =
      await ctx.runAction(internal._services.search.TavilySearchService.discoverSourcesInternal, {
        query: refinedQuery,
        maxResults: 5,
        topic: "finance",
        searchDepth: "basic",
      });
    return results
      .map((r) => ({
        title: r.title ?? "Untitled",
        url: r.url ?? "",
        snippet: (r.snippet ?? r.content ?? "").trim(),
      }))
      .filter((r) => r.snippet.length > 50)
      .map(
        (r, i) =>
          ({
            id: `ext_finance_${i}`,
            sourceId: `ext_finance_${i}`,
            sourceTitle: r.title,
            sourceUrl: r.url,
            content: r.snippet.slice(0, 6000),
            chunkIndex: 0,
            similarity: 0.5,
            metadata: { sectionTitle: "Web source (finance)" },
          }) as ReferenceChunk
      );
  } catch (e: unknown) {
    console.warn("[ChatEval] Finance search failed:", String(e));
    return [];
  }
}

/** The output language an eval asks for. The prompt ignores unknown codes, so they are an error here. */
export function evalOutputLanguage(candidate: string | undefined): string | undefined {
  if (candidate === undefined) return undefined;
  if (!VALID_LANGUAGE_CODES.includes(candidate)) {
    throw new Error(
      `Unsupported output language "${candidate}". Use one of: ${VALID_LANGUAGE_CODES.join(", ")}`
    );
  }
  return candidate;
}

// ─── Token Estimation Helpers ────────────────────────────────

/** Rough token estimate for eval cost tracking (~4 chars / token). */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function estimateChatTokenUsage(
  question: string,
  answer: string,
  selectedChunks: ReferenceChunk[]
): { prompt: number; completion: number; total: number } {
  const contextText = selectedChunks.map((c) => c.content).join("\n\n");
  const promptTokens = estimateTokens(question) + estimateTokens(contextText);
  const completionTokens = estimateTokens(answer);
  return {
    prompt: promptTokens,
    completion: completionTokens,
    total: promptTokens + completionTokens,
  };
}

export interface ChatEvalResult {
  answer: string;
  citations: string[];
  subQueries: string[];
  /** Sub-queries whose search threw or timed out (their zero results mean they never ran). */
  failedSubQueries: string[];
  preRerankChunks: ReferenceChunk[];
  postRerankChunks: ReferenceChunk[];
  selectedChunks: ReferenceChunk[];
  latencyMs: number;
  tokenUsage?: { prompt: number; completion: number; total: number };
  tokenUsageSource?: "provider" | "estimated";
  stageSpans?: AgentStageSpan[];
  /** Provider calls the agent made this turn (LLM, embedding, rerank). */
  callCounters?: CallCounters;
  /** Context token budget the agent applied to this question (list budget for list queries). */
  contextTokenBudget?: number;
  /** Instruction mode the agent ran this question in. */
  instructionMode?: "default" | "learningGuide" | "custom";
  sourcePolicy?: {
    channels: string[];
    maxResultsPerChannel?: number;
  };
  /** True when the run stopped after context selection, so `answer` is empty. */
  retrievalOnly?: boolean;
  /** The overrides this run applied, as requested; absent for production values. */
  configOverrides?: ChatConfigOverrides;
}

// ─── Action ──────────────────────────────────────────────────

export const runChatEval = action({
  args: chatEvalActionArgs,
  handler: async (ctx, args): Promise<ChatEvalResult> => {
    assertRagEvalGate(args.evalSecret);
    const chatConfig = resolveChatConfig(args.configOverrides);

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

    const documentIdStrings = args.documentIds as Id<"documents">[] | undefined;

    const retrieveClock = createRetrieveClock();
    let rerankStartedAt: number | undefined;
    let rerankEndedAt: number | undefined;
    let selectStartedAt: number | undefined;
    let selectEndedAt: number | undefined;
    let providerUsage: { prompt: number; completion: number; total: number } | undefined;
    let agentCallCounters: CallCounters | undefined;
    let agentStageSpans: AgentStageSpan[] | undefined;

    // ── Vector search runner: production's, so chunk metadata (totalChunks, titles) and
    // thresholds match what chat sees ──

    const productionVectorSearchRunner = createChatVectorSearchRunner(ctx, notebookIdTyped);
    const vectorSearchRunner = async (
      embedding: number[],
      limit: number,
      docIds?: string[]
    ): Promise<VectorSearchRawResult[]> => {
      retrieveClock.markNotebookStart();
      try {
        return await productionVectorSearchRunner(embedding, limit, docIds);
      } finally {
        retrieveClock.markNotebookEnd();
      }
    };

    // ── Keyword search runner ──

    const keywordSearchRunner = async (query: string, limit: number, docIds?: string[]) => {
      retrieveClock.markNotebookStart();
      try {
        return await ctx.runQuery(internal.documents.internal.keywordSearch, {
          notebookId: notebookIdTyped,
          userId: evalUserId,
          query,
          limit,
          documentIds: docIds as Id<"documents">[] | undefined,
        });
      } finally {
        retrieveClock.markNotebookEnd();
      }
    };

    // ── Services ──

    const embeddingService = new EmbeddingService(process.env.OPENAI_API_KEY || "");

    // Same rerank as production chat, so eval scores match what users get. Uncached: a cached
    // score would make repeat runs identical, collapse the rerank span, and warm the prod cache.
    const rerankFn = createRerankFn(ctx, { bypassCache: true });

    // ── Spy wrapper for globalRerankFn ──

    let capturedPreRerankDocs: Array<{ id: string; content: string }> = [];
    let capturedRerankOutput: Array<{ id: string; content: string; score?: number }> = [];

    const spyGlobalRerankFn: GlobalRerankFn = async (query, documents) => {
      capturedPreRerankDocs = [...documents];
      rerankStartedAt = Date.now();
      try {
        const result = await rerankFn(query, documents);
        capturedRerankOutput = result;
        return result;
      } finally {
        rerankEndedAt = Date.now();
      }
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

    // Production passes the full-document fetcher too; without it evals never exercised
    // full-document expansion.
    const agent = new ChatAgent({
      vectorSearchHandler: hybridSearch,
      globalRerankFn: spyGlobalRerankFn,
      smartModel: evalSmartModel(args.smartModel),
      outputLanguage: evalOutputLanguage(args.outputLanguage),
      fetchDocumentFn: createFetchDocumentFn(ctx),
      fetchDocumentTitlesFn: createFetchDocumentTitlesFn(ctx, notebookIdTyped),
      fetchOpeningPassagesFn: createFetchOpeningPassagesFn(ctx, notebookIdTyped),
      configOverrides: args.configOverrides,
    });

    // ── Consume the full generator stream ──

    let answer = "";
    let references: ReferenceChunk[] = [];
    const subQueries: string[] = [];
    const failedSubQueries: string[] = [];

    const userIdStr = evalUserId as string;
    const notebookIdStr = args.notebookId as string;

    const sourcePolicyChannels = args.sourcePolicy?.channels ?? ["notebook"];

    // ── External sources for non-notebook channels ──
    // Production discovery (chat/_streamSources.ts) does web, news and academic, and returns the
    // same chunk shape production passes the agent. Production chat has no finance channel, so
    // finance keeps the eval-only Tavily search below until that is decided.
    let externalChunks: ReferenceChunk[] = [];
    const externalChannels = sourcePolicyChannels.filter((ch) => ch !== "notebook");
    const productionChannels = externalChannels.filter((ch) => ch !== "finance");

    if (externalChannels.length > 0) {
      retrieveClock.markExternalStart();
      try {
        const discovered =
          productionChannels.length > 0
            ? await discoverChatExternalSources(
                ctx,
                args.question,
                { channels: productionChannels },
                createServiceLogger("chatEval", "runChatEval", { notebookId: notebookIdStr })
              )
            : { chunks: [] };
        const finance = externalChannels.includes("finance")
          ? await evalFinanceChunks(ctx, args.question)
          : [];
        externalChunks = mergeExternalChunks(discovered.chunks, finance);
        console.log(
          `[ChatEval] External search complete: ${externalChunks.length} chunks (${productionChannels.join(", ") || "no production channels"}${finance.length > 0 ? ", finance" : ""})`
        );
      } finally {
        retrieveClock.markExternalEnd();
      }
    }

    // Built as production builds them: history budgeted with the same setting, and chat settings
    // shaped like production's merged settings. Only learning guide mode reads the history.
    const conversationHistory = evalConversationHistory(
      args.question,
      args.conversationHistory,
      parseInt(env.CHAT_HISTORY_TOKEN_BUDGET ?? "4000", 10)
    );
    const chatSettings = evalChatSettings(
      args.chatSettings?.instructionMode,
      args.notebookInstructions
    );

    for await (const chunk of agent.streamResponse(
      {
        userId: userIdStr,
        noteId: notebookIdStr,
        conversationHistory,
        chatSettings,
        documentIds: documentIdStrings,
        enableNotebookSearch: sourcePolicyChannels.includes("notebook"),
        sourcePolicy: {
          channels: sourcePolicyChannels,
          maxResultsPerChannel: args.sourcePolicy?.maxResultsPerChannel ?? 5,
          ...(args.sourcePolicy?.domainAllowlist
            ? { domainAllowlist: args.sourcePolicy.domainAllowlist }
            : {}),
          ...(args.sourcePolicy?.recencyDays ? { recencyDays: args.sourcePolicy.recencyDays } : {}),
        },
        externalChunks: externalChunks.length > 0 ? externalChunks : undefined,
        evalRetrievalOnly: args.retrievalOnly === true,
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
          selectStartedAt ??= rerankEndedAt ?? retrieveClock.getSpan().endedAt ?? startTime;
          selectEndedAt = Date.now();
          break;
        case "tool_call": {
          const tc = chunk.data as {
            tool?: string;
            query?: string;
            status?: string;
            failed?: boolean;
          };
          if (tc?.query && tc?.status === "searching") {
            subQueries.push(tc.query);
          }
          if (tc?.query && tc?.status === "done" && tc.failed === true) {
            failedSubQueries.push(tc.query);
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
        case "done": {
          const doneData = chunk.data as
            | {
                tokenUsage?: { prompt: number; completion: number; total: number };
                callCounters?: CallCounters;
                stageSpans?: AgentStageSpan[];
              }
            | undefined;
          const usage = doneData?.tokenUsage;
          if (usage && typeof usage.total === "number" && usage.total > 0) {
            providerUsage = usage;
          }
          agentCallCounters = doneData?.callCounters;
          agentStageSpans = doneData?.stageSpans;
          break;
        }
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

    const retrieveSpan = retrieveClock.getSpan();

    const telemetry = buildChatEvalTelemetry({
      retrieveMs: retrieveSpan.durationMs,
      rerankMs:
        rerankStartedAt !== undefined && rerankEndedAt !== undefined
          ? rerankEndedAt - rerankStartedAt
          : undefined,
      selectMs:
        selectStartedAt !== undefined && selectEndedAt !== undefined
          ? selectEndedAt - selectStartedAt
          : undefined,
      provider: providerUsage,
      estimated: estimateChatTokenUsage(args.question, answer, selectedChunks),
      callCounters: agentCallCounters,
      agentSpans: agentStageSpans,
    });

    return {
      answer,
      citations: Array.from(citationSet),
      subQueries,
      failedSubQueries,
      preRerankChunks,
      postRerankChunks,
      selectedChunks,
      latencyMs: Date.now() - startTime,
      tokenUsage: telemetry.tokenUsage,
      tokenUsageSource: telemetry.tokenUsageSource,
      stageSpans: telemetry.stageSpans,
      callCounters: telemetry.callCounters,
      // The context budget the agent applies to this question: the list budget for list queries.
      contextTokenBudget: isListEnumerationQuery(args.question)
        ? chatConfig.listQueryContextTokenBudget
        : chatConfig.contextTokenBudget,
      instructionMode: chatSettings.instructionMode,
      sourcePolicy: args.sourcePolicy,
      ...(args.retrievalOnly === true ? { retrievalOnly: true } : {}),
      configOverrides: args.configOverrides,
    };
  },
});
