"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { getAuthUserId } from "../auth";
import { internal } from "../_generated/api";
import { env } from "../_lib/env";
import { AudioTranscriptionService } from "../_services/extraction/AudioTranscriptionService";

/**
 * Transcribe an ephemeral audio clip in Convex storage (uploaded for this flow only)
 * and delete the blob. Requires notebook read access.
 */
export const transcribeChatAudio = action({
  args: {
    storageId: v.id("_storage"),
    notebookId: v.id("notebooks"),
  },
  returns: v.object({ text: v.string() }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }

    await ctx.runQuery(
      internal.chat.voiceTranscriptionAccess.assertCanReadNotebookForChatVoice,
      {
        notebookId: args.notebookId,
        userId,
      }
    );

    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) {
      throw new Error("Storage object not found or expired");
    }

    try {
      const service = new AudioTranscriptionService(env.TOGETHER_AI_API_KEY);
      const text = await service.transcribe(url);
      return { text: text.trim() };
    } finally {
      await ctx.storage.delete(args.storageId);
    }
  },
});
