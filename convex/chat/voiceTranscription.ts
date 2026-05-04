"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { getAuthUserId } from "../auth";
import { internal } from "../_generated/api";
import { env } from "../_lib/env";
import { StorageError } from "../_lib/errors";
import { toConvexError } from "../_lib/serviceErrors";
import { AudioTranscriptionService } from "../_services/extraction/AudioTranscriptionService";
import { createServiceLogger } from "../_lib/logging/serviceLogger";

/** Per-user, per-hour rate limit on voice transcription calls. */
const _MAX_VOICE_TRANSCRIPTIONS_PER_HOUR = 20;

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
    const logger = createServiceLogger("voiceTranscription", "transcribeChatAudio");
    logger.operationStart({ notebookId: args.notebookId });

    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }

    // Rate limit: per-user, per-hour
    await ctx.runMutation(internal._lib.limits.checkDailyLimitInternal, {
      userId,
      feature: "chat",
    });

    // Verify the user can read the notebook
    await ctx.runQuery(
      internal.chat.voiceTranscriptionAccess.assertCanReadNotebookForChatVoice,
      { notebookId: args.notebookId, userId }
    );

    // Verify the storage blob exists
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) {
      const err = new StorageError("getUrl", "Storage object not found or expired", {
        storageId: args.storageId,
      });
      logger.operationError(err);
      throw toConvexError(err);
    }

    try {
      const service = new AudioTranscriptionService(env.TOGETHER_AI_API_KEY);
      const text = await service.transcribe(url);

      // Consume rate limit token on success
      await ctx.runMutation(internal._lib.limits.consumeDailyLimitInternal, {
        userId,
        feature: "chat",
      });

      logger.operationComplete();
      return { text: text.trim() };
    } catch (err) {
      logger.operationError(err);
      throw toConvexError(err);
    } finally {
      try {
        await ctx.storage.delete(args.storageId);
      } catch {
        // best-effort cleanup
      }
    }
  },
});
