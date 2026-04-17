import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";

/**
 * Database operations for conversations.
 * No query/mutation/action exports — used by convex/conversations.ts and jobs.
 */

export async function getConversation(
  ctx: QueryCtx,
  conversationId: Id<"conversations">
): Promise<Doc<"conversations"> | null> {
  return await ctx.db.get("conversations", conversationId);
}

export async function getConversationByUserAndNotebook(
  ctx: QueryCtx,
  userId: Id<"users">,
  notebookId: Id<"notebooks">
): Promise<Doc<"conversations"> | null> {
  return await ctx.db
    .query("conversations")
    .withIndex("by_user_notebook", (q) => q.eq("userId", userId).eq("notebookId", notebookId))
    .first();
}

export async function getUserConversations(
  ctx: QueryCtx,
  userId: Id<"users">
): Promise<Doc<"conversations">[]> {
  return await ctx.db
    .query("conversations")
    .withIndex("by_user_notebook", (q) => q.eq("userId", userId))
    .order("desc")
    .collect();
}

export type ConversationCreate = {
  userId: Id<"users">;
  notebookId: Id<"notebooks">;
  title?: string;
};

export async function createConversation(
  ctx: MutationCtx,
  data: ConversationCreate
): Promise<Id<"conversations">> {
  const now = Date.now();
  return await ctx.db.insert("conversations", {
    userId: data.userId,
    notebookId: data.notebookId,
    title: data.title,
    createdAt: now,
    updatedAt: now,
  });
}

export type ConversationUpdate = {
  title?: string;
};

export async function updateConversation(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
  updates: ConversationUpdate
): Promise<void> {
  await ctx.db.patch("conversations", conversationId, {
    ...updates,
    updatedAt: Date.now(),
  });
}

export async function deleteConversation(
  ctx: MutationCtx,
  conversationId: Id<"conversations">
): Promise<void> {
  await ctx.db.delete("conversations", conversationId);
}
