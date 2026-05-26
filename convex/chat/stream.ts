"use node";

import { internalAction } from "../_generated/server";
import { internal, components } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { createChunkBuffer } from "./_streamBuffer";
import { streamChatResponse } from "./_streamChatResponse";

export { streamChatResponse } from "./_streamChatResponse";

// Re-export for consumers that expect these types from stream.ts
export type { ChatVectorSearchResult } from "./_streamSearch";
export type { ExternalChunk, DiscoveredSource } from "./_streamSources";

/** HTTP + internal stream `sourcePolicy` (subset persisted on research plans). */
export type StreamSourcePolicy = {
  channels: string[];
  academicFilters?: {
    publicationYearFrom?: number;
    publicationYearTo?: number;
    minCitations?: number;
    openAccessOnly?: boolean;
    hasFullText?: boolean;
    fieldOfStudyTerms?: string[];
  };
};

const CHAT_STREAM_FLUSH_MS = 85;
const CHAT_STREAM_FLUSH_MIN_CHARS = 200;
const CHAT_STREAM_MAX_CHUNK_CHARS = 65536;

export const runWithStreamId = internalAction({
  args: {
    streamId: v.string(),
    userId: v.string(),
    notebookId: v.string(),
    message: v.string(),
    documentIds: v.optional(v.array(v.string())),
    conversationId: v.optional(v.id("conversations")),
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
        academicFilters: v.optional(
          v.object({
            publicationYearFrom: v.optional(v.number()),
            publicationYearTo: v.optional(v.number()),
            minCitations: v.optional(v.number()),
            openAccessOnly: v.optional(v.boolean()),
            hasFullText: v.optional(v.boolean()),
            fieldOfStudyTerms: v.optional(v.array(v.string())),
          })
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    const streamId = args.streamId;

    const rawAddChunk = async (text: string) => {
      if (!text) return;
      await ctx.runMutation(components.persistentTextStreaming.lib.addChunk, {
        streamId,
        text,
        final: false,
      });
    };

    const buffer = createChunkBuffer(rawAddChunk, {
      flushMs: CHAT_STREAM_FLUSH_MS,
      minChars: CHAT_STREAM_FLUSH_MIN_CHARS,
      maxChunkChars: CHAT_STREAM_MAX_CHUNK_CHARS,
    });

    const chunkAppender = async (text: string) => buffer.append(text);

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

      await streamChatResponse(
        ctx,
        args.streamId,
        args.userId,
        args.notebookId,
        args.message,
        args.documentIds,
        chunkAppender,
        conversationId,
        (args.sourcePolicy ?? { channels: ["notebook"] }) as StreamSourcePolicy
      );

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
        await buffer.flush();
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


