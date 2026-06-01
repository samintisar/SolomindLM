"use node";

import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { action } from "../../_generated/server";
import { getAuthUserId } from "../../auth";

interface ScheduleWrittenQuestionsResult {
  writtenQuestionId: string;
  status: string;
  writtenQuestion: { _id: string; title: string; status: string };
}

export const scheduleWrittenQuestions = action({
  args: {
    notebookId: v.id("notebooks"),
    documentIds: v.optional(v.array(v.id("documents"))),
    questionCount: v.optional(v.number()),
    difficulty: v.optional(v.string()),
    questionType: v.optional(v.string()),
    focus: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ScheduleWrittenQuestionsResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    await ctx.runMutation(internal._lib.limits.checkDailyLimitInternal, {
      userId,
      feature: "writtenQuestion",
    });

    const documentIds = args.documentIds ?? [];
    if (documentIds.length === 0) {
      throw new Error(
        "Please select at least one source. Content generation uses only your selected sources."
      );
    }

    const writtenQuestion = await ctx.runMutation(
      internal.studio.writtenQuestions.index.createInternal,
      {
        userId,
        notebookId: args.notebookId,
        title: "Written Questions",
        questionType: args.questionType || "short",
        metadata: {
          difficulty: args.difficulty || "medium",
          questionCount: args.questionCount || 10,
          focus: args.focus,
          documentIds,
        },
      }
    );
    if (!writtenQuestion) {
      throw new Error("Failed to create written question");
    }
    const writtenQuestionId = writtenQuestion._id;

    await ctx.scheduler.runAfter(
      0,
      internal.studio.writtenQuestions.job.writtenQuestionsGeneration,
      {
        writtenQuestionId,
        userId,
        notebookId: args.notebookId,
        documentIds,
        questionCount: args.questionCount || 10,
        difficulty: args.difficulty || "medium",
        questionType: args.questionType || "short",
        focus: args.focus,
      }
    );

    return {
      writtenQuestionId,
      status: "generating",
      writtenQuestion: { _id: writtenQuestionId, title: "Written Questions", status: "generating" },
    };
  },
});
