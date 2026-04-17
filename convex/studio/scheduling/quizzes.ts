"use node";

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { getAuthUserId } from "../../auth";

interface ScheduleQuizResult {
  quizId: string;
  status: string;
  quiz: { _id: string; title: string; status: string };
}

export const scheduleQuiz = action({
  args: {
    notebookId: v.id("notebooks"),
    documentIds: v.optional(v.array(v.id("documents"))),
    questionCount: v.optional(v.number()),
    difficulty: v.optional(v.string()),
    focus: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ScheduleQuizResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    await ctx.runMutation(internal._lib.limits.checkDailyLimitInternal, {
      userId,
      feature: "quiz",
    });

    const documentIds = args.documentIds ?? [];
    if (documentIds.length === 0) {
      throw new Error(
        "Please select at least one source. Content generation uses only your selected sources."
      );
    }

    const quiz = await ctx.runMutation(internal.studio.quizzes.index.createInternal, {
      userId,
      notebookId: args.notebookId,
      title: "Quiz",
      metadata: {
        difficulty: args.difficulty || "medium",
        questionCount: args.questionCount || 10,
        focus: args.focus,
        documentIds,
      },
    });
    if (!quiz) {
      throw new Error("Failed to create quiz");
    }
    const quizId = quiz._id;

    await ctx.scheduler.runAfter(0, internal.studio.quizzes.job.quizGeneration, {
      quizId,
      userId,
      notebookId: args.notebookId,
      documentIds,
      questionCount: args.questionCount || 10,
      difficulty: args.difficulty || "medium",
      focus: args.focus,
    });

    return {
      quizId,
      status: "generating",
      quiz: { _id: quizId, title: "Quiz", status: "generating" },
    };
  },
});
