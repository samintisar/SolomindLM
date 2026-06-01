"use node";

import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { action } from "../../_generated/server";
import { getAuthUserId } from "../../auth";

interface ScheduleFlashcardsResult {
  flashcardId: string;
  status: string;
  flashcard: { _id: string; title: string; status: string };
}

export const scheduleFlashcards = action({
  args: {
    notebookId: v.id("notebooks"),
    documentIds: v.optional(v.array(v.id("documents"))),
    cardCount: v.optional(v.number()),
    difficulty: v.optional(v.string()),
    topic: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ScheduleFlashcardsResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    await ctx.runMutation(internal._lib.limits.checkDailyLimitInternal, {
      userId,
      feature: "flashcard",
    });

    const documentIds = args.documentIds ?? [];
    if (documentIds.length === 0) {
      throw new Error(
        "Please select at least one source. Content generation uses only your selected sources."
      );
    }

    const flashcard = await ctx.runMutation(internal.studio.flashcards.index.createInternal, {
      userId,
      notebookId: args.notebookId,
      title: "Flashcards",
      metadata: {
        difficulty: args.difficulty || "medium",
        cardCount: args.cardCount || 35,
        topic: args.topic,
        documentIds,
      },
    });
    if (!flashcard) {
      throw new Error("Failed to create flashcard");
    }
    const flashcardId = flashcard._id;

    await ctx.scheduler.runAfter(0, internal.studio.flashcards.job.flashcardGeneration, {
      flashcardId,
      userId,
      notebookId: args.notebookId,
      documentIds,
      cardCount: args.cardCount || 35,
      difficulty: args.difficulty || "medium",
      topic: args.topic,
    });

    return {
      flashcardId,
      status: "generating",
      flashcard: { _id: flashcardId, title: "Flashcards", status: "generating" },
    };
  },
});
