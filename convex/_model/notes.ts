import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";

/**
 * Database operations for notes (saved chats and manual notes).
 * No query/mutation/action exports — used by convex/userNotes.ts and jobs.
 */

export async function getNote(ctx: QueryCtx, noteId: Id<"notes">): Promise<Doc<"notes"> | null> {
  return await ctx.db.get("notes", noteId);
}

export async function listByNotebook(
  ctx: QueryCtx,
  notebookId: Id<"notebooks">,
  userId?: Id<"users">
): Promise<Doc<"notes">[]> {
  const query = ctx.db
    .query("notes")
    .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId));

  if (userId) {
    return await ctx.db
      .query("notes")
      .withIndex("by_notebook_and_user", (q) =>
        q.eq("notebookId", notebookId).eq("userId", userId)
      )
      .order("desc")
      .collect();
  }
  return await query.order("desc").collect();
}

/** Manual notes are shared; saved chat notes stay private to their author. */
export async function listByNotebookShared(
  ctx: QueryCtx,
  notebookId: Id<"notebooks">,
  viewerUserId: Id<"users">
): Promise<Doc<"notes">[]> {
  const rows = await ctx.db
    .query("notes")
    .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
    .order("desc")
    .collect();
  return rows.filter(
    (n) => n.type === "manual" || (n.type === "chat" && n.userId === viewerUserId)
  );
}

export async function listByUser(ctx: QueryCtx, userId: Id<"users">): Promise<Doc<"notes">[]> {
  return await ctx.db
    .query("notes")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .collect();
}

export type NoteCreate = {
  userId: Id<"users">;
  notebookId: Id<"notebooks">;
  type: "chat" | "manual";
  title: string;
  content?: string;
  messages?: unknown[];
  messageCount?: number;
  conversationId?: Id<"conversations">;
  metadata?: unknown;
};

export async function createNote(ctx: MutationCtx, data: NoteCreate): Promise<Id<"notes">> {
  const now = Date.now();
  return await ctx.db.insert("notes", {
    userId: data.userId,
    notebookId: data.notebookId,
    type: data.type,
    title: data.title,
    content: data.content,
    messages: data.messages,
    messageCount: data.messageCount,
    conversationId: data.conversationId,
    status: "completed",
    metadata: data.metadata,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Create a note and return the created document.
 * Use this when you need the created document immediately.
 */
export async function createNoteAndFetch(
  ctx: MutationCtx,
  data: NoteCreate
): Promise<Doc<"notes">> {
  const id = await createNote(ctx, data);
  const note = await getNote(ctx, id);
  if (!note) throw new Error("Failed to create note");
  return note;
}

export type NoteUpdate = {
  title?: string;
  content?: string;
  messages?: unknown[];
  messageCount?: number;
  metadata?: unknown;
};

export async function updateNote(
  ctx: MutationCtx,
  noteId: Id<"notes">,
  updates: NoteUpdate
): Promise<void> {
  await ctx.db.patch("notes", noteId, {
    ...updates,
    updatedAt: Date.now(),
  });
}

export async function deleteNote(ctx: MutationCtx, noteId: Id<"notes">): Promise<void> {
  await ctx.db.delete("notes", noteId);
}
