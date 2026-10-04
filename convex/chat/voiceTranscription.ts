"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import { env } from "../_lib/env";
import { StorageError } from "../_lib/errors";
import { createServiceLogger } from "../_lib/logging/serviceLogger";
import { toConvexError } from "../_lib/serviceErrors";
import { AudioTranscriptionService } from "../_services/extraction/AudioTranscriptionService";
import { getAuthUserId } from "../auth";

/** Per-user, per-hour rate limit on voice transcription calls. */
const _MAX_VOICE_TRANSCRIPTIONS_PER_HOUR = 20;

/** Delay before retrying a voice clip delete that failed at the end of the request. */
const VOICE_CLIP_DELETE_RETRY_MS = 60_000;

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

    // Verify the user can read the notebook. Kept outside the cleanup below so a caller
    // without access cannot use this action to delete an arbitrary storage object.
    await ctx.runQuery(internal.chat.voiceTranscriptionAccess.assertCanReadNotebookForChatVoice, {
      notebookId: args.notebookId,
      userId,
    });

    // From here on the clip is deleted however the request ends (the privacy policy says so);
    // a failed delete is logged and retried by `deleteVoiceClip`.
    try {
      // Rate limit: per-user, per-hour
      await ctx.runMutation(internal._lib.limits.checkDailyLimitInternal, {
        userId,
        feature: "chat",
      });

      // Verify the storage blob exists
      const url = await ctx.storage.getUrl(args.storageId);
      if (!url) {
        throw new StorageError("getUrl", "Storage object not found or expired", {
          storageId: args.storageId,
        });
      }

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
      } catch (deleteErr) {
        // Don't let the clip outlive the request silently: log it and retry from a mutation.
        logger.error("voice_clip_delete_failed", deleteErr, { storageId: args.storageId });
        try {
          await ctx.scheduler.runAfter(
            VOICE_CLIP_DELETE_RETRY_MS,
            internal.chat.voiceTranscriptionAccess.deleteVoiceClip,
            { storageId: args.storageId }
          );
        } catch (scheduleErr) {
          logger.error("voice_clip_delete_retry_not_scheduled", scheduleErr, {
            storageId: args.storageId,
          });
        }
      }
    }
  },
});
