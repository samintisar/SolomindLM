import { internalMutation, internalQuery, internalAction } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { getNotebookAccess } from "../_lib/notebookAccess";
import * as ConvModel from "../_model/conversations";

// ============================================================
// Types
// ============================================================

/**
 * Chunk-level metadata for RAG context.
 * Extracted during chunking and used for retrieval context.
 */
export interface ChunkMetadata {
  totalChunks?: number;
  relativePosition?: number;
  chunkLengthChars?: number;
  wordCount?: number;
  sentenceCount?: number;
  pageNumber?: number | null;
  sectionTitle?: string | null;
  sectionLevel?: number | null;
  headingPath?: string[];
  previousChunkPreview?: string | null;
  nextChunkPreview?: string | null;
  hasCodeBlock?: boolean;
  hasMathNotation?: boolean;
  hasTable?: boolean;
  hasBulletList?: boolean;
  hasNumberedList?: boolean;
}

export interface ReferenceChunk {
  id: string;
  sourceId: string;
  /** Notebook document (same for all chunks from one file); use for UI grouping */
  documentId?: string;
  sourceTitle: string;
  /** Original URL for `url` / `youtube` documents — use for opening in browser (fileName may be title or hostname only) */
  sourceUrl?: string;
  content: string;
  chunkIndex: number;
  similarity?: number;
  rrfScore?: number;
  vectorRank?: number;
  keywordRank?: number;
  // Chunk metadata for enhanced context
  metadata?: ChunkMetadata;
}

// ============================================================
// Chat History Service Functions
// ============================================================

/**
 * Get or create a conversation for a notebook
 */
export const getOrCreateConversation = internalMutation({
  args: {
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
  },
  handler: async (ctx, args) => {
    const { userId, notebookId } = args;

    const access = await getNotebookAccess(ctx, notebookId, userId);
    if (!access) {
      throw new Error("Notebook access denied");
    }

    const existing = await ConvModel.getPrimaryConversationForNotebook(ctx, notebookId);

    if (existing) {
      console.log(`[ChatHistoryService] Found existing conversation: ${existing._id}`);
      return existing._id;
    }

    const conversationId = await ctx.db.insert("conversations", {
      userId,
      notebookId,
      title: "New Chat",
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
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { conversationId, limit = 50 } = args;

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
      .order("asc")
      .take(limit);

    return messages.map((msg) => ({
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
  id: Id<"messages">;
  role: string;
  content: string;
  createdAt: number;
  references?: ReferenceChunk[];
  metadata?: unknown;
};

/** Return type of getConversationWithMessages */
type ConversationWithMessages = (Doc<"conversations"> | null) & {
  messages: ConversationMessage[];
};

/**
 * Get conversation with messages
 */
export const getConversationWithMessages = internalAction({
  args: {
    userId: v.string(),
    notebookId: v.id("notebooks"),
    messageLimit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ConversationWithMessages> => {
    "use node";

    const { userId, notebookId, messageLimit = 50 } = args;

    // Get or create conversation
    const conversationId: Id<"conversations"> = await ctx.runMutation(
      internal.storage.ChatHistoryService.getOrCreateConversation,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { userId: userId as any, notebookId }
    );

    // Get conversation details (internal, no auth)
    const conversation: Doc<"conversations"> | null = await ctx.runQuery(
      internal.chat.conversations.getInternal,
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
    conversationId: v.id("conversations"),
    userId: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const { conversationId, content } = args;

    const messageId = await ctx.db.insert("messages", {
      conversationId,
      role: "user",
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
    conversationId: v.id("conversations"),
    userId: v.string(),
    content: v.string(),
    references: v.optional(v.array(v.any())),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { conversationId, content, references, metadata } = args;

    const messageId = await ctx.db.insert("messages", {
      conversationId,
      role: "assistant",
      content,
      references,
      metadata: metadata || {},
      createdAt: Date.now(),
    });

    console.log(
      `[ChatHistoryService] Added assistant message with ${references?.length || 0} references`
    );

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
    conversationId: v.id("conversations"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const { conversationId, userId } = args;

    const conversation = await ctx.db.get(conversationId);
    if (!conversation) {
      throw new Error("Conversation not found or access denied");
    }
    const access = await getNotebookAccess(ctx, conversation.notebookId, userId as Id<"users">);
    if (!access) {
      throw new Error("Conversation not found or access denied");
    }

    // Get all messages
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
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
    conversationId: v.id("conversations"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const { conversationId, userId } = args;

    const conversation = await ctx.db.get(conversationId);
    if (!conversation) {
      throw new Error("Conversation not found or access denied");
    }
    const access = await getNotebookAccess(ctx, conversation.notebookId, userId as Id<"users">);
    if (!access) {
      throw new Error("Conversation not found or access denied");
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
    conversationId: v.id("conversations"),
    userId: v.string(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const { conversationId, userId, title } = args;

    const conversation = await ctx.db.get(conversationId);
    if (!conversation) {
      throw new Error("Conversation not found or access denied");
    }
    const access = await getNotebookAccess(ctx, conversation.notebookId, userId as Id<"users">);
    if (!access) {
      throw new Error("Conversation not found or access denied");
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
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { userId } = args;

    return await ConvModel.getUserConversations(ctx, userId);
  },
});
