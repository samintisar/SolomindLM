import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { getAuthUserId } from "./auth";

/**
 * Get or create a conversation for a notebook
 */
export const ensureConversation = internalMutation({
  args: {
    notebookId: v.id("notebooks"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Look for existing conversation
    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_user_notebook", (q) =>
        q.eq("userId", args.userId).eq("notebookId", args.notebookId)
      )
      .first();

    if (existing) {
      // Update timestamp
      await ctx.db.patch(existing._id, {
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    // Create new conversation
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
 * Get all conversations for a user
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_user_notebook")
      .filter((q) => q.eq(q.field("userId"), userId))
      .order("desc")
      .collect();

    // Get notebook info for each conversation
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

    // Verify user owns the conversation
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== userId) {
      throw new Error("Conversation not found");
    }

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("asc")
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
      .paginate({ cursor: args.cursor as any, numItems: args.limit || 50 });

    return {
      messages: messages.page,
      cursor: messages.continueCursor,
      isDone: messages.isDone,
    };
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
 * Delete a conversation
 */
export const remove = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    // Verify ownership
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== userId) {
      throw new Error("Conversation not found");
    }

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
 * Clear all messages in a conversation
 */
export const clearMessages = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    // Verify ownership
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== userId) {
      throw new Error("Conversation not found");
    }

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
