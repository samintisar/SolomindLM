import { query, internalQuery } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from './auth';

/**
 * Get a conversation by ID
 */
export const get = query({
  args: {
    conversationId: v.id('conversations'),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Unauthenticated');

    const conversation = await ctx.db.get(args.conversationId);

    if (!conversation || conversation.userId !== userId) {
      throw new Error('Conversation not found');
    }

    return conversation;
  },
});

/**
 * Get or create conversation for a notebook
 */
export const getOrCreate = query({
  args: {
    notebookId: v.id('notebooks'),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Unauthenticated');

    // Try to find existing conversation
    const existing = await ctx.db
      .query('conversations')
      .withIndex('by_user_notebook', (q) =>
        q.eq('userId', userId).eq('notebookId', args.notebookId)
      )
      .first();

    if (existing) {
      return existing;
    }

    // Return null - caller should create if needed
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

    return await ctx.db
      .query('conversations')
      .withIndex('by_user_notebook', (q) => q.eq('userId', userId))
      .order('desc')
      .collect();
  },
});

/**
 * Internal: Get conversation without auth check
 */
export const getInternal = internalQuery({
  args: {
    conversationId: v.id('conversations'),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.conversationId);
  },
});
