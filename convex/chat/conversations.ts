import { v } from "convex/values";
import { internalQuery, query } from "../_generated/server";
import { assertCanReadConversation } from "../_lib/conversationAccess";
import { assertCanReadNotebook } from "../_lib/notebookAccess";
import * as Conversations from "../_model/conversations";
import { getAuthUserId } from "../auth";

/**
 * Get a conversation by ID
 */
export const get = query({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    return await assertCanReadConversation(ctx, args.conversationId, userId);
  },
});

/**
 * Get or create conversation for a notebook
 */
export const getOrCreate = query({
  args: {
    notebookId: v.id("notebooks"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    await assertCanReadNotebook(ctx, args.notebookId, userId);

    const existing = await Conversations.getPrimaryConversationForNotebook(ctx, args.notebookId);

    if (existing) {
      return existing;
    }

    return null;
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

    return await Conversations.getUserConversations(ctx, userId);
  },
});

/**
 * List all conversations for a specific notebook, ordered by most recently updated
 */
export const listForNotebook = query({
  args: {
    notebookId: v.id("notebooks"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    await assertCanReadNotebook(ctx, args.notebookId, userId);

    const conversations = await Conversations.listConversationsInNotebook(ctx, args.notebookId);

    return conversations.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  },
});

/**
 * Internal: Get conversation without auth check
 */
export const getInternal = internalQuery({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    return await Conversations.getConversation(ctx, args.conversationId);
  },
});
