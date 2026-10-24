import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { NotebookAccessRole } from "../_lib/notebookAccess";

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
    .withIndex("by_user_notebook_and_updatedAt", (q) =>
      q.eq("userId", userId).eq("notebookId", notebookId)
    )
    .first();
}

export type ConversationCreate = {
  userId: Id<"users">;
  notebookId: Id<"notebooks">;
  title?: string;
  instructionMode?: "default" | "learningGuide" | "custom";
  customInstructions?: string;
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
    instructionMode: data.instructionMode,
    customInstructions: data.customInstructions,
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

/** The user asking for conversations, with their access role on the notebook. */
export type ConversationRequester = { userId: Id<"users">; access: NotebookAccessRole };

/**
 * The single visibility rule. Viewers see only their own threads; owners and editors see every
 * shared thread plus their own private ones, never another user's private thread.
 */
export function isConversationVisible(
  conversation: Pick<Doc<"conversations">, "userId" | "isPrivate">,
  requester: ConversationRequester
): boolean {
  if (requester.access === "viewer") return conversation.userId === requester.userId;
  return !conversation.isPrivate || conversation.userId === requester.userId;
}

/**
 * Threads `isConversationVisible` allows, read through indexes so a public notebook's chat never
 * reads (or subscribes to) other viewers' private threads.
 */
export async function listVisibleConversations(
  ctx: QueryCtx,
  notebookId: Id<"notebooks">,
  requester: ConversationRequester
): Promise<Doc<"conversations">[]> {
  const own = await ctx.db
    .query("conversations")
    .withIndex("by_user_notebook_and_updatedAt", (q) =>
      q.eq("userId", requester.userId).eq("notebookId", notebookId)
    )
    .collect();
  if (requester.access === "viewer") return own;

  const sharedRange = (isPrivate: false | undefined) =>
    ctx.db
      .query("conversations")
      .withIndex("by_notebook_and_isPrivate_and_updatedAt", (q) =>
        q.eq("notebookId", notebookId).eq("isPrivate", isPrivate)
      )
      .collect();
  // Shared threads have no `isPrivate`; an explicit `false` is treated the same way.
  const [unset, explicitFalse] = await Promise.all([sharedRange(undefined), sharedRange(false)]);

  const byId = new Map<Id<"conversations">, Doc<"conversations">>();
  for (const c of [...unset, ...explicitFalse, ...own]) byId.set(c._id, c);
  return [...byId.values()];
}

/** Most recently updated thread this user can see, or null. */
export async function getPrimaryVisibleConversation(
  ctx: QueryCtx,
  notebookId: Id<"notebooks">,
  requester: ConversationRequester
): Promise<Doc<"conversations"> | null> {
  // The newest of each range `listVisibleConversations` reads, instead of every thread in them.
  const own = ctx.db
    .query("conversations")
    .withIndex("by_user_notebook_and_updatedAt", (q) =>
      q.eq("userId", requester.userId).eq("notebookId", notebookId)
    )
    .order("desc")
    .first();
  const newestShared = (isPrivate: false | undefined) =>
    ctx.db
      .query("conversations")
      .withIndex("by_notebook_and_isPrivate_and_updatedAt", (q) =>
        q.eq("notebookId", notebookId).eq("isPrivate", isPrivate)
      )
      .order("desc")
      .first();
  const candidates =
    requester.access === "viewer"
      ? [await own]
      : await Promise.all([own, newestShared(undefined), newestShared(false)]);
  return candidates.reduce<Doc<"conversations"> | null>(
    (newest, c) => (c && (!newest || c.updatedAt > newest.updatedAt) ? c : newest),
    null
  );
}

/**
 * A conversation as returned to a client. A viewer's thread snapshots the owner's custom
 * instructions so chat behaves the same, but the viewer doesn't get to read them.
 */
export function conversationForRequester(
  conversation: Doc<"conversations">,
  access: NotebookAccessRole
): Doc<"conversations"> | Omit<Doc<"conversations">, "customInstructions"> {
  if (access !== "viewer") return conversation;
  const { customInstructions: _customInstructions, ...rest } = conversation;
  return rest;
}

/** Fields for a conversation a user starts: viewers' threads are private to them. */
export function conversationPrivacy(access: NotebookAccessRole): { isPrivate?: true } {
  return access === "viewer" ? { isPrivate: true } : {};
}
