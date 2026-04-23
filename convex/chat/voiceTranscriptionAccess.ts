import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
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
