import { v } from "convex/values";
import { query, mutation, internalAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { getAuthUserId } from "../auth";
import { assertCanReadNotebook, assertCanEditNotebook } from "../_lib/notebookAccess";
import { getConversationIfReadable, assertCanEditConversation } from "../_lib/conversationAccess";
import * as ConvModel from "../_model/conversations";
import type { Id } from "../_generated/dataModel";
import { MAX_MESSAGES_PER_CONVERSATION } from "../_lib/queryCaps";

/**
 * Get all messages for a notebook
 * Note: This assumes conversations are linked to notebooks
 * You may need to adjust this based on your actual data model
 */
export const listByNotebook = query({
  args: {
    notebookId: v.id("notebooks"),
    conversationId: v.optional(v.id("conversations")),
  },
  returns: v.object({
    messages: v.array(v.any()),
    chatGenerating: v.boolean(),
    chatGenerationStartedAt: v.union(v.null(), v.number()),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        messages: [],
        chatGenerating: false,
        chatGenerationStartedAt: null,
      };
    }

    await assertCanReadNotebook(ctx, args.notebookId, userId);

    let conversation;
    if (args.conversationId) {
      const c = await getConversationIfReadable(ctx, args.conversationId, userId);
      if (!c || c.notebookId !== args.notebookId) {
        return { messages: [], chatGenerating: false, chatGenerationStartedAt: null };
      }
      conversation = c;
    } else {
      conversation = await ConvModel.getPrimaryConversationForNotebook(ctx, args.notebookId);
    }

    if (!conversation) {
      return {
        messages: [],
        chatGenerating: false,
        chatGenerationStartedAt: null,
      };
    }

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
      .order("asc")
      .take(MAX_MESSAGES_PER_CONVERSATION);

    const inFlight = conversation.chatGenerationInFlight ?? 0;
    return {
      messages,
      chatGenerating: inFlight > 0,
      chatGenerationStartedAt: conversation.chatGenerationStartedAt ?? null,
    };
  },
});

/**
 * Create a new conversation
 */
export const createConversation = mutation({
  args: {
    notebookId: v.id("notebooks"),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    await assertCanReadNotebook(ctx, args.notebookId, userId);

    // Snapshot the notebook's instruction mode onto the conversation (locked at creation)
    const notebook = await ctx.db.get(args.notebookId);
    const chatSettings = notebook?.chatSettings as
      | {
          instructionMode?: "default" | "learningGuide" | "custom";
          customInstructions?: string;
        }
      | undefined;

    const now = Date.now();

    const conversationId = await ctx.db.insert("conversations", {
      userId,
      notebookId: args.notebookId,
      title: args.title,
      instructionMode: chatSettings?.instructionMode,
      customInstructions: chatSettings?.customInstructions,
      createdAt: now,
      updatedAt: now,
    });

    return await ctx.db.get(conversationId);
  },
});

/**
 * Send a message
 */
export const sendMessage = mutation({
  args: {
    notebookId: v.id("notebooks"),
    content: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    references: v.optional(v.array(v.any())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    await assertCanReadNotebook(ctx, args.notebookId, userId);

    let conversation = await ConvModel.getPrimaryConversationForNotebook(ctx, args.notebookId);

    if (!conversation) {
      const now = Date.now();
      const conversationId = await ctx.db.insert("conversations", {
        userId,
        notebookId: args.notebookId,
        createdAt: now,
        updatedAt: now,
      });
      conversation = await ctx.db.get(conversationId);
    }

    if (!conversation) {
      throw new Error("Failed to create conversation");
    }

    // Insert the message
    const messageId = await ctx.db.insert("messages", {
      conversationId: conversation._id,
      role: args.role,
      content: args.content,
      references: args.references,
      createdAt: Date.now(),
    });

    // Update conversation timestamp
    await ctx.db.patch(conversation._id, {
      updatedAt: Date.now(),
    });

    return await ctx.db.get(messageId);
  },
});

/**
 * Send a user message (for optimistic updates before streaming)
 * This mutation is called before the streaming action to add the user message immediately
 */
export const sendMessageOptimistic = mutation({
  args: {
    notebookId: v.id("notebooks"),
    message: v.string(),
    documentIds: v.optional(v.array(v.string())),
    conversationId: v.optional(v.id("conversations")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    await assertCanReadNotebook(ctx, args.notebookId, userId);

    let conversation: {
      _id: Id<"conversations">;
      chatGenerationInFlight?: number;
      title?: string;
      userId?: Id<"users">;
      notebookId?: Id<"notebooks">;
    } | null;
    if (args.conversationId) {
      const c = await getConversationIfReadable(ctx, args.conversationId, userId);
      if (!c || c.notebookId !== args.notebookId) {
        throw new Error("Conversation not found");
      }
      conversation = c;
    } else {
      conversation = await ConvModel.getPrimaryConversationForNotebook(ctx, args.notebookId);

      if (!conversation) {
        const now = Date.now();
        const conversationId = await ctx.db.insert("conversations", {
          userId,
          notebookId: args.notebookId,
          createdAt: now,
          updatedAt: now,
        });
        conversation = await ctx.db.get(conversationId);
      }
    }

    if (!conversation) {
      throw new Error("Failed to create conversation");
    }

    // Insert the user message
    const messageId = await ctx.db.insert("messages", {
      conversationId: conversation._id,
      role: "user",
      content: args.message,
      createdAt: Date.now(),
    });

    const now = Date.now();
    const inFlight = (conversation.chatGenerationInFlight ?? 0) + 1;

    // Update conversation: server-visible "generating" for all tabs/devices
    await ctx.db.patch(conversation._id, {
      updatedAt: now,
      chatGenerationInFlight: inFlight,
      chatGenerationStartedAt: now,
    });

    // Auto-generate title on first message if untitled
    if (!conversation.title) {
      const existingMessages = await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) => q.eq("conversationId", conversation!._id))
        .collect();
      if (existingMessages.length <= 1) {
        await ctx.scheduler.runAfter(0, internal.chat.messages.generateAndSetTitle, {
          conversationId: conversation._id,
          content: args.message,
        });
      }
    }

    // Return the message ID for reference
    return {
      messageId,
      conversationId: conversation._id,
      tempMessageId: messageId, // For compatibility with frontend expectations
    };
  },
});

/**
 * Release one chat generation refcount (e.g. fetch failed before the stream job ran).
 * Safe to call when the server job already finished (idempotent).
 */
export const releaseChatGeneration = mutation({
  args: {
    notebookId: v.id("notebooks"),
    conversationId: v.optional(v.id("conversations")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }

    await assertCanReadNotebook(ctx, args.notebookId, userId);

    let conversation;
    if (args.conversationId) {
      conversation = await getConversationIfReadable(ctx, args.conversationId, userId);
      if (!conversation) return;
    } else {
      await assertCanReadNotebook(ctx, args.notebookId, userId);
      conversation = await ConvModel.getPrimaryConversationForNotebook(ctx, args.notebookId);
    }

    if (!conversation) {
      return;
    }

    const prev = conversation.chatGenerationInFlight ?? 0;
    if (prev <= 0) {
      await ctx.db.patch(conversation._id, {
        chatGenerationInFlight: undefined,
        chatGenerationStartedAt: undefined,
        updatedAt: Date.now(),
      });
      return;
    }
    const n = prev - 1;
    const now = Date.now();
    if (n <= 0) {
      await ctx.db.patch(conversation._id, {
        chatGenerationInFlight: undefined,
        chatGenerationStartedAt: undefined,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(conversation._id, {
        chatGenerationInFlight: n,
        updatedAt: now,
      });
    }
  },
});

/**
 * Set thumbs up/down feedback on an assistant message.
 * Pass null to remove existing feedback.
 */
export const setMessageFeedback = mutation({
  args: {
    messageId: v.id("messages"),
    feedback: v.union(v.literal("up"), v.literal("down"), v.null()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");

    await assertCanEditConversation(ctx, message.conversationId, userId);

    await ctx.db.patch(args.messageId, {
      feedback: args.feedback ?? undefined,
    });
  },
});

/**
 * Delete an assistant message and any messages after it.
 * Used for retry — removes the failed assistant response (and trailing messages)
 * so a fresh response can be generated.
 */
export const deleteMessagesFrom = mutation({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const target = await ctx.db.get(args.messageId);
    if (!target) throw new Error("Message not found");

    await assertCanEditConversation(ctx, target.conversationId, userId);

    // Get all messages in the conversation ordered by creation time
    const allMessages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", target.conversationId))
      .order("asc")
      .collect();

    // Delete the target message and everything after it
    const targetIdx = allMessages.findIndex((m) => m._id === target._id);
    if (targetIdx < 0) return { deleted: 0 };

    let deleted = 0;
    for (let i = targetIdx; i < allMessages.length; i++) {
      await ctx.db.delete(allMessages[i]._id);
      deleted++;
    }

    return { deleted };
  },
});

/**
 * Clear all messages for a notebook
 */
export const clearHistory = mutation({
  args: {
    notebookId: v.id("notebooks"),
    conversationId: v.optional(v.id("conversations")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    await assertCanReadNotebook(ctx, args.notebookId, userId);

    let conversation;
    if (args.conversationId) {
      try {
        conversation = await assertCanEditConversation(ctx, args.conversationId, userId);
      } catch {
        return { message: "Conversation not found" };
      }
    } else {
      await assertCanEditNotebook(ctx, args.notebookId, userId);
      conversation = await ConvModel.getPrimaryConversationForNotebook(ctx, args.notebookId);
    }

    if (!conversation) {
      return { message: "No conversation found" };
    }

    // Delete all messages
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
      .collect();

    for (const message of messages) {
      await ctx.db.delete(message._id);
    }

    await ctx.db.patch(conversation._id, {
      chatGenerationInFlight: undefined,
      chatGenerationStartedAt: undefined,
      updatedAt: Date.now(),
    });

    return { message: "Chat history cleared" };
  },
});

/**
 * Rename a conversation
 */
export const renameConversation = mutation({
  args: {
    conversationId: v.id("conversations"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    await assertCanEditConversation(ctx, args.conversationId, userId);

    await ctx.db.patch(args.conversationId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal mutation to set conversation title (called by auto-title action)
 */
export const setTitleInternal = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.conversationId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal action: generate a title for a conversation using LLM, then persist it.
 */
export const generateAndSetTitle = internalAction({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const title: string = await ctx.runAction(internal._services.ai.titleGenerator.generateTitle, {
      chunk: args.content,
    });
    await ctx.runMutation(internal.chat.messages.setTitleInternal, {
      conversationId: args.conversationId,
      title,
    });
  },
});
