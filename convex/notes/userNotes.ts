import { v } from "convex/values";
import { mutation, query, internalMutation, action } from "../_generated/server";
import { getAuthUserId } from "../auth";
import { assertCanEditNotebook, assertCanReadNotebook } from "../_lib/notebookAccess";
import * as Notes from "../_model/notes";
import { internal } from "../_generated/api";

/**
 * Convert chat messages to clean markdown format
 */
function messagesToMarkdown(messages: any[]): string {
  if (messages.length === 0) return "";

  let markdown = "";

  for (const message of messages) {
    if (message.role === "user") {
      markdown += `## You\n\n${(message.content ?? "").trim()}\n\n`;
    } else if (message.role === "assistant") {
      markdown += `## Assistant\n\n${(message.content ?? "").trim()}\n\n`;
      markdown += `---\n\n`;
    }
  }

  return markdown.trim();
}

/**
 * List all notes for a notebook
 */
export const list = query({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    await assertCanReadNotebook(ctx, args.notebookId, userId);
    return await Notes.listByNotebookShared(ctx, args.notebookId, userId);
  },
});

/**
 * Get a specific note by ID
 */
export const get = query({
  args: { id: v.id("notes") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const note = await Notes.getNote(ctx, args.id);

    if (!note) {
      return null;
    }

    try {
      await assertCanReadNotebook(ctx, note.notebookId, userId);
    } catch {
      return null;
    }

    if (note.type === "chat" && note.userId !== userId) {
      return null;
    }

    return note;
  },
});

/**
 * Create a new manual note
 */
export const create = mutation({
  args: {
    notebookId: v.id("notebooks"),
    title: v.string(),
    content: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    await assertCanEditNotebook(ctx, args.notebookId, userId);

    return await Notes.createNoteAndFetch(ctx, {
      userId,
      notebookId: args.notebookId,
      type: "manual",
      title: args.title,
      content: args.content,
      metadata: args.metadata,
    });
  },
});

/**
 * Internal: Create a note (for use by actions and jobs).
 * Uses internal so Convex code calls internal.* instead of api.* per best practices.
 */
export const createInternal = internalMutation({
  args: {
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    type: v.union(v.literal("chat"), v.literal("manual")),
    title: v.string(),
    content: v.optional(v.string()),
    messages: v.optional(v.array(v.any())),
    messageCount: v.optional(v.number()),
    conversationId: v.optional(v.id("conversations")),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await assertCanEditNotebook(ctx, args.notebookId, args.userId);
    return await Notes.createNoteAndFetch(ctx, args);
  },
});

/**
 * Save a chat conversation as a note with AI-generated title.
 * This action generates a title from the first user message, then creates the note.
 */
export const saveChat = action({
  args: {
    notebookId: v.id("notebooks"),
    messages: v.array(v.any()),
    messageCount: v.number(),
    conversationId: v.optional(v.id("conversations")),
    metadata: v.optional(v.any()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ _id: string; title: string; status: string; createdAt: number }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    // Generate title from first user message
    let title = "Chat Conversation";
    const firstUserMessage = args.messages.find((m: any) => m.role === "user" && m.content);

    if (firstUserMessage && firstUserMessage.content) {
      try {
        // Use first 500 characters for title generation
        const chunk =
          firstUserMessage.content.length > 500
            ? firstUserMessage.content.substring(0, 500)
            : firstUserMessage.content;

        title = await ctx.runAction(internal._services.ai.titleGenerator.generateTitle, {
          chunk,
        });
      } catch (error) {
        console.error("[saveChat] Title generation failed:", error);
        // Fall back to truncated first user message
        const truncated =
          firstUserMessage.content.length > 50
            ? firstUserMessage.content.substring(0, 50) + "..."
            : firstUserMessage.content;
        title = truncated;
      }
    }

    // Convert messages to markdown for storage
    const markdownContent = messagesToMarkdown(args.messages);

    // Create the note via internal mutation (which verifies notebook ownership)
    const note = await ctx.runMutation(internal.notes.userNotes.createInternal, {
      userId,
      notebookId: args.notebookId,
      type: "chat",
      title,
      content: markdownContent,
      messages: args.messages,
      messageCount: args.messageCount,
      conversationId: args.conversationId,
      metadata: args.metadata,
    });

    return note;
  },
});

/**
 * Update a note
 */
export const update = mutation({
  args: {
    id: v.id("notes"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    messages: v.optional(v.array(v.any())),
    messageCount: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const note = await Notes.getNote(ctx, args.id);
    if (!note) {
      throw new Error("Note not found");
    }

    await assertCanEditNotebook(ctx, note.notebookId, userId);
    if (note.type === "chat" && note.userId !== userId) {
      throw new Error("Note not found");
    }

    // Only patch fields that were explicitly provided (undefined would clear content/messages)
    const updates: Notes.NoteUpdate = {};
    if (args.title !== undefined) updates.title = args.title;
    if (args.content !== undefined) updates.content = args.content;
    if (args.messages !== undefined) updates.messages = args.messages;
    if (args.messageCount !== undefined) updates.messageCount = args.messageCount;
    if (args.metadata !== undefined) updates.metadata = args.metadata;

    if (Object.keys(updates).length > 0) {
      await Notes.updateNote(ctx, args.id, updates);
    }

    return await Notes.getNote(ctx, args.id);
  },
});

/**
 * Delete a note
 */
export const remove = mutation({
  args: { id: v.id("notes") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const note = await Notes.getNote(ctx, args.id);
    if (!note) {
      throw new Error("Note not found");
    }

    await assertCanEditNotebook(ctx, note.notebookId, userId);
    if (note.type === "chat" && note.userId !== userId) {
      throw new Error("Note not found");
    }

    await Notes.deleteNote(ctx, args.id);
  },
});
