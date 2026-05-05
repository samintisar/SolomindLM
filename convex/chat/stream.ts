"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { components } from "../_generated/api";
import { createServiceLogger } from "../_lib/logging/serviceLogger";
import { createChunkBuffer, CHAT_HISTORY_FETCH_LIMIT } from "./stream/streamBuffer";
import { setupChatAgent } from "./stream/agentSetup";
import { runExternalSearch } from "./stream/externalSearch";
import { persistAssistantMessage } from "./stream/persist";
import { runResearchPlanPhase } from "./stream/researchPlan";
import { runResearchExecute } from "./stream/researchExecute";

export { runResearchExecute };

export const runWithStreamId = internalAction({
  args: {
    streamId: v.string(),
    userId: v.string(),
    notebookId: v.string(),
    message: v.string(),
    documentIds: v.optional(v.array(v.string())),
    attachedDocumentIds: v.optional(v.array(v.string())),
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
    academicFilters: v.optional(
      v.object({
        provider: v.optional(v.string()),
        fieldsOfStudy: v.optional(v.array(v.string())),
        publicationYearFrom: v.optional(v.number()),
        publicationYearTo: v.optional(v.number()),
        minCitations: v.optional(v.number()),
        openAccessOnly: v.optional(v.boolean()),
        hasFullText: v.optional(v.boolean()),
      })
    ),
    userMessageId: v.optional(v.id("messages")),
  },
  handler: async (ctx, args) => {
    const streamId = args.streamId as any;
    const { flushTokenBuffer, chunkAppender } = createChunkBuffer(ctx, streamId);

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
          ctx as any,
          args.streamId,
          args.userId,
          args.notebookId,
          args.message,
          args.documentIds,
          args.sourcePolicy ?? { channels: ["notebook"] },
          chunkAppender,
          conversationId,
          args.userMessageId,
          args.academicFilters
        );
      } else {
        await streamChatResponse(
          ctx as any,
          args.streamId,
          args.userId,
          args.notebookId,
          args.message,
          args.documentIds,
          chunkAppender,
          conversationId,
          args.sourcePolicy ?? { channels: ["notebook"] },
          args.attachedDocumentIds,
          args.academicFilters
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

async function streamChatResponse(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  streamId: string,
  userId: string,
  notebookId: string,
  message: string,
  documentIds: string[] | undefined,
  chunkAppender: (text: string) => Promise<void>,
  conversationId: Id<"conversations">,
  sourcePolicy?: { channels: string[] },
  attachedDocumentIds?: string[],
  academicFilters?: {
    provider?: string;
    fieldsOfStudy?: string[];
    publicationYearFrom?: number;
    publicationYearTo?: number;
    minCitations?: number;
    openAccessOnly?: boolean;
    hasFullText?: boolean;
  }
): Promise<{ fullResponse: string; references: unknown[]; hasError: boolean }> {
  const chatStreamLog = createServiceLogger("chatStream", "streamChatResponse", {
    userId,
    notebookId: notebookId as Id<"notebooks">,
  });
  chatStreamLog.info("stream_start", { streamId });

  const { messages: messageList } = await ctx.runQuery(internal.chat.index.getMessagesInternal, {
    conversationId,
    limit: CHAT_HISTORY_FETCH_LIMIT,
  });

  const {
    agent,
    resolvedSmartModel,
    mergedChatSettings,
    notebookGrounding,
    includeNotebook,
    externalChunks: notebookExternalChunks,
  } = await setupChatAgent(ctx, userId, notebookId, conversationId, documentIds, sourcePolicy, attachedDocumentIds, messageList, chatStreamLog);

  const { externalSources, externalChunks: searchedExternalChunks } = await runExternalSearch(
    ctx,
    message,
    sourcePolicy,
    chatStreamLog,
    academicFilters
  );

  const allExternalChunks = [...notebookExternalChunks, ...searchedExternalChunks];

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

  const recordPhase = (status: string, msg: string) => {
    const last = agentTrace.phases[agentTrace.phases.length - 1];
    if (last && last.status === status && last.message === msg) {
      return;
    }
    agentTrace.phases.push({ status, message: msg });
  };

  const isGenerationActive = async (): Promise<boolean> =>
    await ctx.runQuery(internal.chat.index.isChatGenerationActiveInternal, { conversationId });

  try {
    for await (const chunk of agent.streamResponse(
      {
        userId,
        noteId: notebookId,
        conversationHistory: messageList
          .filter((m: any) => m.role !== "system")
          .map((m: any) => ({ role: m.role, content: m.content, metadata: m.metadata })),
        documentIds: includeNotebook ? documentIds : [],
        attachedDocumentIds,
        enableNotebookSearch: includeNotebook,
        groundingMode: notebookGrounding,
        externalChunks: allExternalChunks.length > 0 ? allExternalChunks : undefined,
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

  await persistAssistantMessage(
    ctx,
    conversationId,
    streamId,
    fullResponse,
    references,
    hasError,
    agentTrace,
    mergedChatSettings,
    externalSources,
    chatStreamLog,
    isGenerationActive
  );

  chatStreamLog.info("stream_complete", { streamId });

  return {
    fullResponse,
    references,
    hasError,
  };
}
