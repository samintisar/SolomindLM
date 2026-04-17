import { internalMutation } from "../../_generated/server";
import { v } from "convex/values";
import { normalizeMathMarkdownDeep } from "../../_shared/mathMarkdown";
import { buildErrorMetadata } from "./jobErrorUtils";

export const saveQuizResults = internalMutation({
  args: {
    quizId: v.id("quizzes"),
    questions: v.array(v.any()),
    metadata: v.any(),
  },
  handler: async (ctx, args) => {
    const normalizedQuestions = normalizeMathMarkdownDeep(args.questions);

    await ctx.db.patch(args.quizId, {
      questionsData: normalizedQuestions,
      status: "completed",
      updatedAt: Date.now(),
      title: args.metadata?.title ?? "Quiz",
      metadata: {
        ...args.metadata,
        questionCount: normalizedQuestions.length,
        completedAt: Date.now(),
      },
    });
  },
});

export const updateQuizTitle = internalMutation({
  args: {
    quizId: v.id("quizzes"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.quizId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

export const updateQuizStatus = internalMutation({
  args: {
    quizId: v.id("quizzes"),
    status: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const updates: any = {
      status: args.status,
      updatedAt: Date.now(),
    };
    if (args.metadata) {
      updates.metadata = args.metadata;
    }
    await ctx.db.patch(args.quizId, updates);
  },
});

export const markQuizFailed = internalMutation({
  args: {
    quizId: v.id("quizzes"),
    error: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const errorMetadata = buildErrorMetadata(
      args.error,
      args.metadata?.phase || "unknown",
      args.metadata
    );
    await ctx.db.patch(args.quizId, {
      status: "failed",
      updatedAt: Date.now(),
      metadata: {
        ...args.metadata,
        ...errorMetadata,
      },
    });
  },
});

// Multi-phase quiz helpers
export const initQuizMapPhase = internalMutation({
  args: {
    quizId: v.id("quizzes"),
    totalMapTasks: v.number(),
    questionCount: v.number(),
    difficulty: v.string(),
    focus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const quiz = await ctx.db.get(args.quizId);
    if (!quiz) return null;

    await ctx.db.patch(args.quizId, {
      status: "generating",
      updatedAt: Date.now(),
      metadata: {
        ...quiz.metadata,
        phase: "map_processing",
        progress: 30,
        currentStep: "Processing content...",
        totalMapTasks: args.totalMapTasks,
        completedMapTasks: 0,
        mapResults: {},
        questionCount: args.questionCount,
        difficulty: args.difficulty,
        focus: args.focus,
      },
    });
    return args.quizId;
  },
});

export const storeQuizMapResult = internalMutation({
  args: {
    quizId: v.id("quizzes"),
    chunkIndex: v.number(),
    result: v.string(),
  },
  handler: async (ctx, args) => {
    const quiz = await ctx.db.get(args.quizId);
    if (!quiz) return null;

    const existingResults = quiz.metadata?.mapResults || {};
    const updatedResults = {
      ...existingResults,
      [args.chunkIndex]: args.result,
    };

    const completedCount = Object.keys(updatedResults).length;
    const totalCount = quiz.metadata?.totalMapTasks || 0;

    await ctx.db.patch(args.quizId, {
      updatedAt: Date.now(),
      metadata: {
        ...quiz.metadata,
        mapResults: updatedResults,
        completedMapTasks: completedCount,
        progress: 30 + Math.floor((completedCount / totalCount) * 30),
      },
    });
    return args.quizId;
  },
});

export const clearQuizMapData = internalMutation({
  args: {
    quizId: v.id("quizzes"),
  },
  handler: async (ctx, args) => {
    const quiz = await ctx.db.get(args.quizId);
    if (!quiz) return null;

    const { mapResults, ...restMetadata } = quiz.metadata || {};
    await ctx.db.patch(args.quizId, {
      updatedAt: Date.now(),
      metadata: restMetadata,
    });
    return args.quizId;
  },
});
