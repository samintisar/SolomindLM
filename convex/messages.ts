import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "./auth";

/**
 * Get all messages for a notebook
 * Note: This assumes conversations are linked to notebooks
 * You may need to adjust this based on your actual data model
 */
export const listByNotebook = query({
  args: {
    notebookId: v.id("notebooks"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    // First, find the conversation for this notebook
    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_user_notebook", (q) =>
        q.eq("userId", userId).eq("notebookId", args.notebookId)
      )
      .first();

    if (!conversation) {
      return [];
    }

    // Get all messages for this conversation
    return await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
      .order("asc")
      .collect();
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

    const now = Date.now();

    const conversationId = await ctx.db.insert("conversations", {
      userId,
      notebookId: args.notebookId,
      title: args.title,
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

    // Find or create conversation
    let conversation = await ctx.db
      .query("conversations")
      .withIndex("by_user_notebook", (q) =>
        q.eq("userId", userId).eq("notebookId", args.notebookId)
      )
      .first();

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
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    // Find or create conversation
    let conversation = await ctx.db
      .query("conversations")
      .withIndex("by_user_notebook", (q) =>
        q.eq("userId", userId).eq("notebookId", args.notebookId)
      )
      .first();

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

    // Insert the user message
    const messageId = await ctx.db.insert("messages", {
      conversationId: conversation._id,
      role: "user",
      content: args.message,
      createdAt: Date.now(),
    });

    // Update conversation timestamp
    await ctx.db.patch(conversation._id, {
      updatedAt: Date.now(),
    });

    // Return the message ID for reference
    return {
      messageId,
      conversationId: conversation._id,
      tempMessageId: messageId, // For compatibility with frontend expectations
    };
  },
});

/**
 * Clear all messages for a notebook
 */
export const clearHistory = mutation({
  args: {
    notebookId: v.id("notebooks"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    // Find the conversation
    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_user_notebook", (q) =>
        q.eq("userId", userId).eq("notebookId", args.notebookId)
      )
      .first();

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

    return { message: "Chat history cleared" };
  },
});
