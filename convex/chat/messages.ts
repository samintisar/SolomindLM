import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalAction, type QueryCtx, query } from "../_generated/server";
import { assertCanEditConversation, getConversationIfReadable } from "../_lib/conversationAccess";
import { assertCanReadNotebook, getNotebookAccess } from "../_lib/notebookAccess";
import { MAX_MESSAGES_PER_CONVERSATION } from "../_lib/queryCaps";
import * as ConvModel from "../_model/conversations";
import { getAuthUserId } from "../auth";
import { internalMutation, mutation } from "../functions";

const conversationArgs = {
  notebookId: v.id("notebooks"),
  /** Omit for the notebook's most recently updated thread the user can see. */
  conversationId: v.optional(v.id("conversations")),
};

/** The thread a chat query reads: the requested one if the user can read it, else the primary. */
async function resolveReadableConversation(
  ctx: QueryCtx,
  args: { notebookId: Id<"notebooks">; conversationId?: Id<"conversations"> }
): Promise<Doc<"conversations"> | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  const access = await getNotebookAccess(ctx, args.notebookId, userId);
  if (!access) return null;

  if (args.conversationId) {
    const conversation = await getConversationIfReadable(ctx, args.conversationId, userId);
    return conversation && conversation.notebookId === args.notebookId ? conversation : null;
  }
  return await ConvModel.getPrimaryVisibleConversation(ctx, args.notebookId, { userId, access });
}

/**
 * A thread's messages, newest first, a page at a time (#601). The client loads the newest page
 * and fetches older ones as the user scrolls up. It used to read the whole history (up to 10,000
 * messages) and re-read it whenever the thread or any message changed.
 */
export const listPage = query({
  args: { ...conversationArgs, paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const conversation = await resolveReadableConversation(ctx, args);
    if (!conversation) return { page: [], isDone: true, continueCursor: "" };

    return await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

/** Whether an assistant reply is being generated in the thread (a paginated query can't carry it). */
export const generationState = query({
  args: conversationArgs,
  returns: v.object({
    chatGenerating: v.boolean(),
    chatGenerationStartedAt: v.union(v.null(), v.number()),
  }),
  handler: async (ctx, args) => {
    const conversation = await resolveReadableConversation(ctx, args);
    return {
      chatGenerating: (conversation?.chatGenerationInFlight ?? 0) > 0,
      chatGenerationStartedAt: conversation?.chatGenerationStartedAt ?? null,
    };
  },
});

/**
 * @deprecated Replaced by `listPage` + `generationState` (#601). Kept for one release so open tabs
 * and mobile WebViews on the previous web bundle keep working until they reload; remove after.
 */
export const listByNotebook = query({
  args: conversationArgs,
  returns: v.object({
    messages: v.array(v.any()),
    chatGenerating: v.boolean(),
    chatGenerationStartedAt: v.union(v.null(), v.number()),
  }),
  handler: async (ctx, args) => {
    const conversation = await resolveReadableConversation(ctx, args);
    if (!conversation) {
      return { messages: [], chatGenerating: false, chatGenerationStartedAt: null };
    }
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
      .order("asc")
      .take(MAX_MESSAGES_PER_CONVERSATION);
    return {
      messages,
      chatGenerating: (conversation.chatGenerationInFlight ?? 0) > 0,
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

    const { notebook, access } = await assertCanReadNotebook(ctx, args.notebookId, userId);

    // Snapshot the notebook's instruction mode onto the conversation (locked at creation)
    const chatSettings = notebook.chatSettings as
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
      ...ConvModel.conversationPrivacy(access),
      instructionMode: chatSettings?.instructionMode,
      customInstructions: chatSettings?.customInstructions,
      createdAt: now,
      updatedAt: now,
    });

    const conversation = await ctx.db.get(conversationId);
    return conversation ? ConvModel.conversationForRequester(conversation, access) : null;
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

    const { access } = await assertCanReadNotebook(ctx, args.notebookId, userId);

    let conversation = await ConvModel.getPrimaryVisibleConversation(ctx, args.notebookId, {
      userId,
      access,
    });

    if (!conversation) {
      const now = Date.now();
      const conversationId = await ctx.db.insert("conversations", {
        userId,
        notebookId: args.notebookId,
        ...ConvModel.conversationPrivacy(access),
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

    const { access } = await assertCanReadNotebook(ctx, args.notebookId, userId);

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
      conversation = await ConvModel.getPrimaryVisibleConversation(ctx, args.notebookId, {
        userId,
        access,
      });

      if (!conversation) {
        const now = Date.now();
        const conversationId = await ctx.db.insert("conversations", {
          userId,
          notebookId: args.notebookId,
          ...ConvModel.conversationPrivacy(access),
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
        await ctx.scheduler.runAfter(0, internal.chat.actions.generateAndSetTitle, {
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

    const { access } = await assertCanReadNotebook(ctx, args.notebookId, userId);

    let conversation;
    if (args.conversationId) {
      conversation = await getConversationIfReadable(ctx, args.conversationId, userId);
      if (!conversation || conversation.notebookId !== args.notebookId) return;
    } else {
      conversation = await ConvModel.getPrimaryVisibleConversation(ctx, args.notebookId, {
        userId,
        access,
      });
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

    const { access } = await assertCanReadNotebook(ctx, args.notebookId, userId);

    let conversation;
    if (args.conversationId) {
      try {
        conversation = await assertCanEditConversation(ctx, args.conversationId, userId);
      } catch {
        return { message: "Conversation not found" };
      }
    } else {
      conversation = await ConvModel.getPrimaryVisibleConversation(ctx, args.notebookId, {
        userId,
        access,
      });
    }

    if (!conversation) {
      return { message: "No conversation found" };
    }

    // Cancel any in-flight deep-research workflows before wiping messages.
    await ctx.runMutation(internal.research.index.cancelResearchForConversationInternal, {
      conversationId: conversation._id,
    });

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
