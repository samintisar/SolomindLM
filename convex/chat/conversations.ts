import { v } from "convex/values";
import { internalQuery, query } from "../_generated/server";
import { assertCanReadConversation } from "../_lib/conversationAccess";
import { assertCanReadNotebook, canReadNotebook } from "../_lib/notebookAccess";
import * as Conversations from "../_model/conversations";
import { getAuthUserId } from "../auth";

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

    if (!(await canReadNotebook(ctx, args.notebookId, userId))) return [];

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
