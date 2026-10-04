import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { assertCanReadNotebook } from "../_lib/notebookAccess";

/**
 * For chat voice transcription action: assert the user may read the notebook
 * (same access as viewing documents in the notebook).
 */
export const assertCanReadNotebookForChatVoice = internalQuery({
  args: {
    notebookId: v.id("notebooks"),
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertCanReadNotebook(ctx, args.notebookId, args.userId);
    return null;
  },
});

/**
 * Retry for a chat voice clip the transcription action could not delete, so a failed cleanup
 * is retried instead of leaving the recording in storage. No-op if the clip is already gone.
 */
export const deleteVoiceClip = internalMutation({
  args: {
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await ctx.db.system.get(args.storageId)) {
      await ctx.storage.delete(args.storageId);
    }
    return null;
  },
});
