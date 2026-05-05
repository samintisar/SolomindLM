/**
 * Written questions job helpers.
 */
import { internalMutation } from "../../../_generated/server";
import { v } from "convex/values";
import { buildErrorMetadata } from "./errors.js";

export const updateWrittenQuestionsTitle = internalMutation({
  args: {
    writtenQuestionId: v.id("writtenQuestions"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.writtenQuestionId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

export const updateWrittenQuestionsStatus = internalMutation({
  args: {
    writtenQuestionId: v.id("writtenQuestions"),
    status: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: any = {
      status: args.status,
      updatedAt: Date.now(),
    };
    if (args.metadata) {
      updates.metadata = args.metadata;
    }
    await ctx.db.patch(args.writtenQuestionId, updates);
  },
});

export const markWrittenQuestionsFailed = internalMutation({
  args: {
    writtenQuestionId: v.id("writtenQuestions"),
    error: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const errorMetadata = buildErrorMetadata(
      args.error,
      args.metadata?.phase || "unknown",
      args.metadata
    );
    await ctx.db.patch(args.writtenQuestionId, {
      status: "failed",
      updatedAt: Date.now(),
      metadata: {
        ...args.metadata,
        ...errorMetadata,
      },
    });
  },
});

export const storeWrittenQuestionsMapResult = internalMutation({
  args: {
    writtenQuestionId: v.id("writtenQuestions"),
    chunkIndex: v.number(),
    result: v.string(),
  },
  handler: async (ctx, args) => {
    const writtenQuestion = await ctx.db.get(args.writtenQuestionId);
    if (!writtenQuestion) return null;

    const existingResults = writtenQuestion.metadata?.mapResults || {};
    const updatedResults = {
      ...existingResults,
      [args.chunkIndex]: args.result,
    };

    const completedCount = Object.keys(updatedResults).length;
    const totalCount = writtenQuestion.metadata?.totalMapTasks || 0;

    await ctx.db.patch(args.writtenQuestionId, {
      updatedAt: Date.now(),
      metadata: {
        ...writtenQuestion.metadata,
        mapResults: updatedResults,
        completedMapTasks: completedCount,
        progress: 30 + Math.floor((completedCount / totalCount) * 30),
      },
    });
    return args.writtenQuestionId;
  },
});

export const clearWrittenQuestionsMapData = internalMutation({
  args: {
    writtenQuestionId: v.id("writtenQuestions"),
  },
  handler: async (ctx, args) => {
    const writtenQuestion = await ctx.db.get(args.writtenQuestionId);
    if (!writtenQuestion) return null;

    const { mapResults: _mapResults, ...restMetadata } = writtenQuestion.metadata || {};
    await ctx.db.patch(args.writtenQuestionId, {
      updatedAt: Date.now(),
      metadata: restMetadata,
    });
    return args.writtenQuestionId;
  },
});

export const saveWrittenQuestionsResults = internalMutation({
  args: {
    writtenQuestionId: v.id("writtenQuestions"),
    questions: v.array(v.any()),
    metadata: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.writtenQuestionId, {
      questionsData: args.questions,
      status: "completed",
      updatedAt: Date.now(),
      title: args.metadata?.title ?? "Written Questions",
      metadata: {
        ...args.metadata,
        questionCount: args.questions.length,
        completedAt: Date.now(),
      },
    });
  },
});

export const initWrittenQuestionsMapPhase = internalMutation({
  args: {
    writtenQuestionId: v.id("writtenQuestions"),
    totalMapTasks: v.number(),
    questionCount: v.number(),
    difficulty: v.string(),
    questionType: v.string(),
    focus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const writtenQuestion = await ctx.db.get(args.writtenQuestionId);
    if (!writtenQuestion) return null;

    await ctx.db.patch(args.writtenQuestionId, {
      status: "generating",
      updatedAt: Date.now(),
      metadata: {
        ...writtenQuestion.metadata,
        phase: "map_processing",
        progress: 30,
        totalMapTasks: args.totalMapTasks,
        completedMapTasks: 0,
        mapResults: {},
        questionCount: args.questionCount,
        difficulty: args.difficulty,
        questionType: args.questionType,
        focus: args.focus,
      },
    });
    return args.writtenQuestionId;
  },
});
