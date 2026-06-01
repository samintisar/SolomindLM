"use node";

import { ChatAgent, type GlobalRerankFn } from "../_agents/ChatAgent";
import { AVAILABLE_SMART_MODEL_IDS, type SmartModelId } from "../_agents/chat/chatConfig.js";
import { budgetConversationHistory } from "../_agents/chat/chatHistoryBudget";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { env } from "../_lib/env";
import { createServiceLogger } from "../_lib/logging/serviceLogger";
import { EmbeddingService } from "../_services/processing/EmbeddingServiceClient";
import {
  createChatVectorSearchRunner,
  createHybridSearch,
  createKeywordSearchRunner,
  createRerankFn,
  loadHybridSearchConfig,
} from "./_streamSearch";
import { discoverChatExternalSources } from "./_streamSources";
import type { StreamSourcePolicy } from "./stream";

const CHAT_HISTORY_FETCH_LIMIT = 80;

export interface StreamChatResult {
  fullResponse: string;
  references: unknown[];
  hasError: boolean;
}

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

export async function streamChatResponse(
  ctx: ActionCtx,
  streamId: string,
  userId: string,
  notebookId: string,
  message: string,
  documentIds: string[] | undefined,
  chunkAppender: (text: string) => Promise<void>,
  conversationId: Id<"conversations">,
  sourcePolicy?: StreamSourcePolicy
): Promise<StreamChatResult> {
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
    .filter((m: { role: string }) => m.role !== "system")
    .map((m: { role: string; content: string; metadata?: unknown }) => ({
      role: m.role,
      content: m.content,
      metadata: m.metadata,
    }));

  const historyBudget = parseInt(env.CHAT_HISTORY_TOKEN_BUDGET ?? "4000", 10);
  const conversationHistory = budgetConversationHistory(fullHistory, historyBudget);

  const notebookChatSettings = notebookDoc?.chatSettings as
    | {
        instructionMode: "default" | "learningGuide" | "custom";
        customInstructions?: string;
        responseLength: "default" | "longer" | "shorter";
        smartModel?: string;
      }
    | undefined;

  // Validate model ID against whitelist, fall back to env default
  const validModelIds = new Set(AVAILABLE_SMART_MODEL_IDS);
  const resolvedSmartModel =
    notebookChatSettings?.smartModel &&
    validModelIds.has(notebookChatSettings.smartModel as SmartModelId)
      ? (notebookChatSettings.smartModel as SmartModelId)
      : ((env.SMART_LLM ?? "openai/gpt-oss-120b") as SmartModelId);

  // Merge chat settings
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

  // Initialize HybridSearchHandler with both vector and keyword search
  const embeddingService = new EmbeddingService(process.env.TOGETHER_AI_API_KEY || "");

  const vectorSearchRunner = createChatVectorSearchRunner(ctx, notebookIdTyped, chatStreamLog);
  const keywordSearchRunner = createKeywordSearchRunner(
    ctx,
    notebookIdTyped,
    keywordSearchChunkUserId
  );
  const rerankFn = createRerankFn(ctx);
  const globalRerankFn: GlobalRerankFn = rerankFn;

  const hybridSearch = createHybridSearch(
    loadHybridSearchConfig(),
    embeddingService,
    vectorSearchRunner,
    keywordSearchRunner,
    rerankFn
  );

  let userPrefs: { outputLanguage?: string } | null = null;
  try {
    userPrefs = await ctx.runQuery(internal.userPreferences.index.getPreferencesByUserId, {
      userId: userId as Id<"users">,
    });
  } catch (e) {
    console.warn(
      "[chat] user preference fetch failed, using default language",
      e instanceof Error ? e.message : String(e)
    );
  }

  const agent = new ChatAgent({
    vectorSearchHandler: hybridSearch,
    globalRerankFn,
    smartModel: resolvedSmartModel,
    outputLanguage: userPrefs?.outputLanguage,
    fetchDocumentFn: async (documentId: string) => {
      const chunks = await ctx.runQuery(internal.documents.chunks.listChunksByDocument, {
        documentId: documentId as Id<"documents">,
      });
      if (!chunks || chunks.length === 0) return null;

      const sortedChunks = chunks.sort(
        (a: { chunkIndex: number }, b: { chunkIndex: number }) => a.chunkIndex - b.chunkIndex
      );
      const content = sortedChunks.map((c: { content: string }) => c.content).join("\n\n");

      return {
        documentId: documentId as Id<"documents">,
        content,
        chunkCount: chunks.length,
      };
    },
  });

  // External search
  const includeNotebook = (sourcePolicy?.channels ?? ["notebook"]).includes("notebook");
  const { sources: externalSources, chunks: externalChunks } = await discoverChatExternalSources(
    ctx,
    message,
    sourcePolicy ?? { channels: ["notebook"] },
    chatStreamLog
  );

  let fullResponse = "";
  let references: unknown[] = [];
  let hasError = false;

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
    const last = agentTrace.phases[agentTrace.phases.length - 1];
    if (last && last.status === status && last.message === message) {
      return;
    }
    agentTrace.phases.push({ status, message });
  };

  const isGenerationActive = async (): Promise<boolean> =>
    await ctx.runQuery(internal.chat.index.isChatGenerationActiveInternal, { conversationId });

  try {
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
        await chunkAppender(chunk.data ?? "");
      } else if (chunk.type === "references") {
        references = chunk.data ?? [];
        await chunkAppender(`\n__REFERENCES:${JSON.stringify(references)}\n`);
      } else if (chunk.type === "status") {
        if (chunk.status) {
          recordPhase(chunk.status, chunk.message ?? "");
        }
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

  // Persist final assistant message
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
    hadStreamError: hasError || undefined,
    externalSources: externalSources.length > 0 ? externalSources : undefined,
  };

  if (existingMessages.length === 0) {
    chatStreamLog.warn("conversation_cleared_during_generation", {
      detail: "skip_assistant_persist",
    });
  } else {
    const refsToStore = fullResponse.trim() ? references : undefined;
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
          await ctx.runMutation(internal.chat.index.persistAssistantFromStream, {
            conversationId,
            streamId,
            content: contentFinal,
            references: refsToStore,
            metadata: metadataPayload,
          });
          persisted = true;
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

async function sleepMs(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}
