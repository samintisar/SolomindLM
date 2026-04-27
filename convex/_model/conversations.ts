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

/** All threads in a notebook (for Cowork: shared across owner + editors). */
export async function listConversationsInNotebook(
  ctx: QueryCtx,
  notebookId: Id<"notebooks">
): Promise<Doc<"conversations">[]> {
  return await ctx.db
    .query("conversations")
    .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
    .collect();
}

/** Most recently updated thread in a notebook, or null. */
export async function getPrimaryConversationForNotebook(
  ctx: QueryCtx,
  notebookId: Id<"notebooks">
): Promise<Doc<"conversations"> | null> {
  const all = await listConversationsInNotebook(ctx, notebookId);
  if (all.length === 0) {
    return null;
  }
  return all.sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
}

/**
 * Conversations in every notebook the user can access (owned + Cowork memberships).
 */
export async function getUserConversations(
  ctx: QueryCtx,
  userId: Id<"users">
): Promise<Doc<"conversations">[]> {
  const owned = await ctx.db
    .query("notebooks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const memberships = await ctx.db
    .query("notebookMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const notebookIds = new Set<Id<"notebooks">>();
  for (const n of owned) {
    notebookIds.add(n._id);
  }
  for (const m of memberships) {
    notebookIds.add(m.notebookId);
  }
  const all: Doc<"conversations">[] = [];
  for (const notebookId of notebookIds) {
    const convs = await listConversationsInNotebook(ctx, notebookId);
    all.push(...convs);
  }
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
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
