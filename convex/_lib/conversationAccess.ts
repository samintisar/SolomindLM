import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { isConversationVisible } from "../_model/conversations";
import { getNotebookAccess } from "./notebookAccess";

type DbCtx = QueryCtx | MutationCtx;

/**
 * The conversation if this user may see it: they can read its notebook and it is not another
 * user's private thread (see `isConversationVisible`). Null otherwise.
 */
export async function getConversationIfReadable(
  ctx: DbCtx,
  conversationId: Id<"conversations">,
  userId: Id<"users">
): Promise<Doc<"conversations"> | null> {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation) return null;
  const access = await getNotebookAccess(ctx, conversation.notebookId, userId);
  if (!access || !isConversationVisible(conversation, { userId, access })) return null;
  return conversation;
}

export async function assertCanReadConversation(
  ctx: DbCtx,
  conversationId: Id<"conversations">,
  userId: Id<"users">
): Promise<Doc<"conversations">> {
  const conversation = await getConversationIfReadable(ctx, conversationId, userId);
  if (!conversation) throw new Error("Conversation not found");
  return conversation;
}

/**
 * Edit (rename, delete, feedback, retry) any conversation the user can see. For owners and
 * editors that is every shared thread; for a viewer it is only their own private threads.
 */
export async function assertCanEditConversation(
  ctx: DbCtx,
  conversationId: Id<"conversations">,
  userId: Id<"users">
): Promise<Doc<"conversations">> {
  return await assertCanReadConversation(ctx, conversationId, userId);
}
