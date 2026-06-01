import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { assertCanEditNotebook, assertCanReadNotebook } from "./notebookAccess";

type DbCtx = QueryCtx | MutationCtx;

/**
 * True if the user may load messages for this conversation (notebook owner or editor).
 */
export async function getConversationIfReadable(
  ctx: DbCtx,
  conversationId: Id<"conversations">,
  userId: Id<"users">
): Promise<Doc<"conversations"> | null> {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation) {
    return null;
  }
  try {
    await assertCanReadNotebook(ctx, conversation.notebookId, userId);
  } catch {
    return null;
  }
  return conversation;
}

export async function assertCanReadConversation(
  ctx: DbCtx,
  conversationId: Id<"conversations">,
  userId: Id<"users">
): Promise<Doc<"conversations">> {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation) {
    throw new Error("Conversation not found");
  }
  await assertCanReadNotebook(ctx, conversation.notebookId, userId);
  return conversation;
}

export async function assertCanEditConversation(
  ctx: DbCtx,
  conversationId: Id<"conversations">,
  userId: Id<"users">
): Promise<Doc<"conversations">> {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation) {
    throw new Error("Conversation not found");
  }
  await assertCanEditNotebook(ctx, conversation.notebookId, userId);
  return conversation;
}
