import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { getAuthUserId } from "../auth";
import { getNotebookAccess } from "../_lib/notebookAccess";
import { assertCanReadConversation, assertCanEditConversation } from "../_lib/conversationAccess";
import * as ConvModel from "../_model/conversations";

/**
 * Get or create a conversation for a notebook
 */
export const ensureConversation = internalMutation({
  args: {
    notebookId: v.id("notebooks"),
    userId: v.id("users"),
    conversationId: v.optional(v.id("conversations")),
  },
  handler: async (ctx, args) => {
    const access = await getNotebookAccess(ctx, args.notebookId, args.userId);
    if (!access) {
      throw new Error("Access denied");
    }

    if (args.conversationId) {
      const existing = await ctx.db.get(args.conversationId);
      if (existing && existing.notebookId === args.notebookId) {
        await ctx.db.patch(existing._id, { updatedAt: Date.now() });
        return existing._id;
      }
    }

    const inNotebook = await ConvModel.listConversationsInNotebook(ctx, args.notebookId);
    const sorted = inNotebook.sort((a, b) => b.updatedAt - a.updatedAt);
    if (sorted[0]) {
      await ctx.db.patch(sorted[0]._id, { updatedAt: Date.now() });
      return sorted[0]._id;
    }

    const conversationId = await ctx.db.insert("conversations", {
      userId: args.userId,
      notebookId: args.notebookId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return conversationId;
  },
});

/**
 * Decrement chat generation refcount when a stream job finishes (success, error, or throw).
 * Idempotent-safe when the field was already cleared.
 */
export const releaseChatGenerationInternal = internalMutation({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.conversationId);
    if (!c) {
      return;
    }
    const prev = c.chatGenerationInFlight ?? 0;
    if (prev <= 0) {
      await ctx.db.patch(args.conversationId, {
        chatGenerationInFlight: undefined,
        chatGenerationStartedAt: undefined,
        updatedAt: Date.now(),
      });
      return;
    }
    const n = prev - 1;
    if (n <= 0) {
      await ctx.db.patch(args.conversationId, {
        chatGenerationInFlight: undefined,
        chatGenerationStartedAt: undefined,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.patch(args.conversationId, {
        chatGenerationInFlight: n,
        updatedAt: Date.now(),
      });
    }
  },
});

/**
 * Returns whether a chat generation is still active for a conversation.
 * Stream actions poll this to honor user-initiated stops.
 */
export const isChatGenerationActiveInternal = internalQuery({
  args: {
    conversationId: v.id("conversations"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.conversationId);
    if (!c) {
      return false;
    }
    return (c.chatGenerationInFlight ?? 0) > 0;
  },
});

/**
 * Get all conversations for a user
 */
export const list = query({
  args: {},
  returns: v.array(
    v.object({
      id: v.id("conversations"),
      notebookId: v.id("notebooks"),
      notebookTitle: v.string(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const conversations = await ConvModel.getUserConversations(ctx, userId);

    const result = await Promise.all(
      conversations.map(async (conv) => {
        const notebook = await ctx.db.get(conv.notebookId);
        return {
          id: conv._id,
          notebookId: conv.notebookId,
          notebookTitle: notebook?.title || "Unknown",
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
        };
      })
    );

    return result;
  },
});

/**
 * Get messages for a conversation (with pagination)
 */
export const getMessages = query({
  args: {
    conversationId: v.id("conversations"),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { messages: [], cursor: null, isDone: true };

    await assertCanReadConversation(ctx, args.conversationId, userId);

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("asc")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .paginate({ cursor: args.cursor as any, numItems: args.limit || 50 });

    return {
      messages: messages.page,
      cursor: messages.continueCursor,
      isDone: messages.isDone,
    };
  },
});

/**
 * INTERNAL: Get messages for a conversation (no auth check - for HTTP actions)
 * Supports pagination for long conversations
 */
export const getMessagesInternal = internalQuery({
  args: {
    conversationId: v.id("conversations"),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("asc")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .paginate({ cursor: args.cursor as any, numItems: args.limit || 50 });

    return {
      messages: messages.page,
      cursor: messages.continueCursor,
      isDone: messages.isDone,
    };
  },
});

/** Recent messages for deep-research writer context (newest-first window, returned oldest-first). */
export const getRecentConversationTurnsForResearchInternal = internalQuery({
  args: {
    conversationId: v.id("conversations"),
    maxMessages: v.number(),
  },
  returns: v.array(
    v.object({
      role: v.string(),
      content: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    const cap = Math.min(48, Math.max(1, args.maxMessages));
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("desc")
      .take(cap);
    return rows.reverse().map((m) => ({ role: m.role, content: m.content }));
  },
});

/**
 * Resolve the user message row for the current chat turn (HTTP stream runs after sendMessageOptimistic).
 * Prefers exact content match among recent user messages, then the latest user message.
 */
export const getLatestUserMessageIdForPlanInternal = internalQuery({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
  },
  returns: v.union(v.id("messages"), v.null()),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("desc")
      .take(40);
    const userMsgs = rows.filter((m) => m.role === "user");
    const exact = userMsgs.find((m) => m.content === args.content);
    return (exact ?? userMsgs[0])?._id ?? null;
  },
});

/**
 * Add a message to a conversation
 */
export const addMessage = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.string(),
    references: v.optional(v.array(v.any())),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // Validate conversation exists
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: args.role,
      content: args.content,
      references: args.references,
      metadata: args.metadata,
      createdAt: Date.now(),
    });

    // Update conversation timestamp
    await ctx.db.patch(args.conversationId, {
      updatedAt: Date.now(),
    });

    return messageId;
  },
});

/**
 * Idempotent insert of assistant message for one chat stream (HTTP + persistent text streaming).
 * Uses by_conversation_stream; safe to retry with identical args.
 */
export const persistAssistantFromStream = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    streamId: v.string(),
    content: v.string(),
    references: v.optional(v.array(v.any())),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      // Conversation was deleted while the workflow was running — drop the message
      // silently so the workflow does not retry forever.
      return { messageId: null, inserted: false };
    }

    const existing = await ctx.db
      .query("messages")
      .withIndex("by_conversation_stream", (q) =>
        q.eq("conversationId", args.conversationId).eq("streamId", args.streamId)
      )
      .first();

    if (existing) {
      return { messageId: existing._id, inserted: false };
    }

    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: "assistant",
      content: args.content,
      references: args.references,
      metadata: args.metadata,
      streamId: args.streamId,
      createdAt: Date.now(),
    });

    // Drop chatGenerationInFlight in the same write as the assistant row so clients never see
    // a completed reply with chatGenerating still true (fixes follow-up / multi-tab UI races).
    const now = Date.now();
    const prevFlight = conversation.chatGenerationInFlight ?? 0;
    if (prevFlight > 0) {
      const n = prevFlight - 1;
      if (n <= 0) {
        await ctx.db.patch(args.conversationId, {
          updatedAt: now,
          chatGenerationInFlight: undefined,
          chatGenerationStartedAt: undefined,
        });
      } else {
        await ctx.db.patch(args.conversationId, {
          updatedAt: now,
          chatGenerationInFlight: n,
        });
      }
    } else {
      await ctx.db.patch(args.conversationId, { updatedAt: now });
    }

    return { messageId, inserted: true };
  },
});

/**
 * Delete a conversation
 */
export const remove = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    await assertCanEditConversation(ctx, args.conversationId, userId);

    // Cancel any in-flight deep-research workflows so they do not persist
    // results after the conversation is gone.
    await ctx.runMutation(internal.research.index.cancelResearchForConversationInternal, {
      conversationId: args.conversationId,
    });

    // Delete all messages
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .collect();

    for (const message of messages) {
      await ctx.db.delete(message._id);
    }

    // Delete conversation
    await ctx.db.delete(args.conversationId);

    return { message: "Conversation deleted successfully" };
  },
});

/**
 * Patch a message's metadata by messageId.
 * Safe for workflow retries because it targets a specific row.
 */
export const updateMessageMetadata = internalMutation({
  args: {
    messageId: v.id("messages"),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, { metadata: args.metadata });
  },
});

/**
 * Clear all messages in a conversation
 */
export const clearMessages = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    await assertCanEditConversation(ctx, args.conversationId, userId);

    // Delete all messages
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .collect();

    for (const message of messages) {
      await ctx.db.delete(message._id);
    }

    return { message: "Messages cleared successfully" };
  },
});
