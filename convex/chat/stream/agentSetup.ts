"use node";

import { internal } from "../../_generated/api";
import { Id } from "../../_generated/dataModel";
import { ChatAgent, type GlobalRerankFn } from "../../_agents/ChatAgent";
import { AVAILABLE_SMART_MODEL_IDS, type SmartModelId } from "../../_agents/chat/chatConfig.js";
import { HybridSearchHandler } from "../../_agents/chat/hybrid_search.js";
import { cachedRerank, RerankDocument } from "../../_agents/chat/rerankCache.js";
import { EmbeddingService } from "../../_services/processing/EmbeddingServiceClient";
import { env } from "../../_lib/env";
import { buildVectorSearchRunner, buildKeywordSearchRunner } from "./searchRunners";
import { runExternalSearch } from "./externalSearch";

export interface ChatAgentSetup {
  agent: ChatAgent;
  resolvedSmartModel: SmartModelId;
  mergedChatSettings: {
    instructionMode: "default" | "learningGuide" | "custom";
    customInstructions?: string;
    responseLength: "default" | "longer" | "shorter";
  };
  notebookGrounding: "async" | "sync" | "off" | undefined;
  includeNotebook: boolean;
  externalChunks: Array<import("../../storage/ChatHistoryService").ReferenceChunk>;
}

export async function setupChatAgent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  userId: string,
  notebookId: string,
  conversationId: Id<"conversations">,
  documentIds: string[] | undefined,
  sourcePolicy: { channels: string[] } | undefined,
  attachedDocumentIds: string[] | undefined,
  messageList: Array<{ role: string; content: string; metadata?: unknown }>,
  chatStreamLog?: { info: (key: string, meta?: Record<string, unknown>) => void; debug: (key: string, meta?: Record<string, unknown>) => void; warn: (key: string, meta?: Record<string, unknown>) => void }
): Promise<ChatAgentSetup> {
  const notebookIdTyped = notebookId as Id<"notebooks">;

  const notebookDoc = await ctx.runQuery(internal.notebooks.index.getNotebookInternal, {
    notebookId: notebookIdTyped,
  });
  const keywordSearchChunkUserId = (notebookDoc?.userId ?? userId) as Id<"users">;

  const fullHistory = messageList.filter((m) => m.role !== "system");

  const historyBudget = parseInt(env.CHAT_HISTORY_TOKEN_BUDGET ?? "4000", 10);
  const { budgetConversationHistory } = await import("../../_agents/chat/chatHistoryBudget");
  const conversationHistory = budgetConversationHistory(fullHistory, historyBudget);

  const notebookChatSettings = notebookDoc?.chatSettings as
    | {
        instructionMode: "default" | "learningGuide" | "custom";
        customInstructions?: string;
        responseLength: "default" | "longer" | "shorter";
        smartModel?: string;
      }
    | undefined;

  const validModelIds = new Set(AVAILABLE_SMART_MODEL_IDS);
  const resolvedSmartModel =
    notebookChatSettings?.smartModel &&
    validModelIds.has(notebookChatSettings.smartModel as SmartModelId)
      ? (notebookChatSettings.smartModel as SmartModelId)
      : ((env.SMART_LLM ?? "openai/gpt-oss-120b") as SmartModelId);

  const conversationDoc = await ctx.runQuery(internal.chat.conversations.getInternal, {
    conversationId,
  });
  const notebookInstructionMode = (notebookChatSettings?.instructionMode ?? "default") as
    | "default"
    | "learningGuide"
    | "custom";
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

  const vectorSearchRunner = buildVectorSearchRunner(ctx, notebookIdTyped, chatStreamLog);
  const keywordSearchRunner = buildKeywordSearchRunner(
    ctx,
    notebookIdTyped,
    keywordSearchChunkUserId,
    chatStreamLog
  );

  const embeddingService = new EmbeddingService(process.env.TOGETHER_AI_API_KEY || "");

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
      { userId: userId as any }
    );
  } catch (e) {
    console.warn(
      "[chat] user preference fetch failed, using default language",
      e instanceof Error ? e.message : String(e)
    );
  }

  const { externalChunks } = await runExternalSearch(ctx, "", sourcePolicy, chatStreamLog);

  const agent = new ChatAgent({
    vectorSearchHandler: hybridSearch,
    globalRerankFn,
    smartModel: resolvedSmartModel,
    outputLanguage: userPrefs?.outputLanguage,
    fetchDocumentFn: async (documentId: string) => {
      const chunks = await ctx.runQuery(internal.documents.index.listChunksByDocument, {
        documentId: documentId as any,
      });
      if (!chunks || chunks.length === 0) return null;

      const doc = await ctx.runQuery(internal.documents.index.getDocumentInternal, {
        documentId: documentId as any,
        userId: userId as any,
      });

      const sortedChunks = chunks.sort((a: any, b: any) => a.chunkIndex - b.chunkIndex);
      const content = sortedChunks.map((c: any) => c.content).join("\n\n");

      return {
        documentId: documentId as any,
        content,
        chunkCount: chunks.length,
        title: doc?.fileName,
        sourceUrl: doc?.fileUrl?.trim() ? doc.fileUrl : undefined,
      };
    },
  });

  const includeNotebook = (sourcePolicy?.channels ?? ["notebook"]).includes("notebook");

  return {
    agent,
    resolvedSmartModel,
    mergedChatSettings,
    notebookGrounding,
    includeNotebook,
    externalChunks,
  };
}
