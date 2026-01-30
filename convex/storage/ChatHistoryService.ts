import { internalMutation, internalQuery, internalAction } from '../_generated/server';
import type { Id, Doc } from '../_generated/dataModel';
import { v } from 'convex/values';
import { internal } from '../_generated/api';

// ============================================================
// Types
// ============================================================

export interface ReferenceChunk {
  id: string;
  sourceId: string;
  sourceTitle: string;
  content: string;
  chunkIndex: number;
  similarity?: number;
  rrfScore?: number;
  vectorRank?: number;
  keywordRank?: number;
}

// ============================================================
// Chat History Service Functions
// ============================================================

/**
 * Get or create a conversation for a notebook
 */
export const getOrCreateConversation = internalMutation({
  args: {
    userId: v.string(),
    notebookId: v.id('notebooks'),
  },
  handler: async (ctx, args) => {
    const { userId, notebookId } = args;

    // Try to get existing conversation
    const existing = await ctx.db
      .query('conversations')
      .withIndex('by_user_notebook', (q) =>
        q.eq('userId', userId).eq('notebookId', notebookId)
      )
      .first();

    if (existing) {
      console.log(`[ChatHistoryService] Found existing conversation: ${existing._id}`);
      return existing._id;
    }

    // Create new conversation
    const conversationId = await ctx.db.insert('conversations', {
      userId,
      notebookId,
      title: 'New Chat',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    console.log(`[ChatHistoryService] Created new conversation: ${conversationId}`);
    return conversationId;
  },
});

/**
 * Get messages for a conversation
 */
export const getMessages = internalQuery({
  args: {
    conversationId: v.id('conversations'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { conversationId, limit = 50 } = args;

    const messages = await ctx.db
      .query('messages')
      .withIndex('by_conversation', (q) => q.eq('conversationId', conversationId))
      .order('asc')
      .take(limit);

    return messages.map(msg => ({
      id: msg._id,
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt,
      references: msg.references as ReferenceChunk[] | undefined,
      metadata: msg.metadata,
    }));
  },
});

/** Message shape returned by getConversationWithMessages */
type ConversationMessage = {
  id: Id<'messages'>;
  role: string;
  content: string;
  createdAt: number;
  references?: ReferenceChunk[];
  metadata?: unknown;
};

/** Return type of getConversationWithMessages */
type ConversationWithMessages = (Doc<'conversations'> | null) & {
  messages: ConversationMessage[];
};

/**
 * Get conversation with messages
 */
export const getConversationWithMessages = internalAction({
  args: {
    userId: v.string(),
    notebookId: v.id('notebooks'),
    messageLimit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ConversationWithMessages> => {
    "use node";

    const { userId, notebookId, messageLimit = 50 } = args;

    // Get or create conversation
    const conversationId: Id<'conversations'> = await ctx.runMutation(
      internal.storage.ChatHistoryService.getOrCreateConversation,
      { userId, notebookId }
    );

    // Get conversation details (internal, no auth)
    const conversation: Doc<'conversations'> | null = await ctx.runQuery(
      internal.conversations.getInternal,
      { conversationId }
    );

    // Get messages
    const messages: ConversationMessage[] = await ctx.runQuery(
      internal.storage.ChatHistoryService.getMessages,
      { conversationId, limit: messageLimit }
    );

    return {
      ...conversation,
      messages,
    } as ConversationWithMessages;
  },
});

/**
 * Add a user message
 */
export const addUserMessage = internalMutation({
  args: {
    conversationId: v.id('conversations'),
    userId: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const { conversationId, content } = args;

    const messageId = await ctx.db.insert('messages', {
      conversationId,
      role: 'user',
      content,
      createdAt: Date.now(),
    });

    // Update conversation updated_at timestamp
    await ctx.db.patch(conversationId, {
      updatedAt: Date.now(),
    });

    return messageId;
  },
});

/**
 * Add an assistant message with references
 */
export const addAssistantMessage = internalMutation({
  args: {
    conversationId: v.id('conversations'),
    userId: v.string(),
    content: v.string(),
    references: v.optional(v.array(v.any())),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { conversationId, content, references, metadata } = args;

    const messageId = await ctx.db.insert('messages', {
      conversationId,
      role: 'assistant',
      content,
      references,
      metadata: metadata || {},
      createdAt: Date.now(),
    });

    console.log(`[ChatHistoryService] Added assistant message with ${references?.length || 0} references`);

    // Update conversation updated_at timestamp
    await ctx.db.patch(conversationId, {
      updatedAt: Date.now(),
    });

    return messageId;
  },
});

/**
 * Clear all messages in a conversation
 */
export const clearConversation = internalMutation({
  args: {
    conversationId: v.id('conversations'),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const { conversationId, userId } = args;

    // Verify ownership
    const conversation = await ctx.db.get(conversationId);
    if (!conversation || conversation.userId !== userId) {
      throw new Error('Conversation not found or access denied');
    }

    // Get all messages
    const messages = await ctx.db
      .query('messages')
      .withIndex('by_conversation', (q) => q.eq('conversationId', conversationId))
      .collect();

    // Delete all messages
    for (const message of messages) {
      await ctx.db.delete(message._id);
    }

    console.log(`[ChatHistoryService] Cleared conversation: ${conversationId}`);
  },
});

/**
 * Delete a conversation and all its messages
 */
export const deleteConversation = internalMutation({
  args: {
    conversationId: v.id('conversations'),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const { conversationId, userId } = args;

    // Verify ownership
    const conversation = await ctx.db.get(conversationId);
    if (!conversation || conversation.userId !== userId) {
      throw new Error('Conversation not found or access denied');
    }

    // Messages will be cascade deleted via schema
    await ctx.db.delete(conversationId);

    console.log(`[ChatHistoryService] Deleted conversation: ${conversationId}`);
  },
});

/**
 * Rename a conversation
 */
export const renameConversation = internalMutation({
  args: {
    conversationId: v.id('conversations'),
    userId: v.string(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const { conversationId, userId, title } = args;

    // Verify ownership
    const conversation = await ctx.db.get(conversationId);
    if (!conversation || conversation.userId !== userId) {
      throw new Error('Conversation not found or access denied');
    }

    await ctx.db.patch(conversationId, { title });

    console.log(`[ChatHistoryService] Renamed conversation: ${title}`);
  },
});

/**
 * Get all conversations for a user
 */
export const getUserConversations = internalQuery({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = args;

    const conversations = await ctx.db
      .query('conversations')
      .withIndex('by_user_notebook', (q) => q.eq('userId', userId))
      .order('desc')
      .collect();

    return conversations;
  },
});
