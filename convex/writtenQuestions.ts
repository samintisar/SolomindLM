import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "./auth";

/**
 * List all written question sets for a notebook
 */
export const list = query({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("writtenQuestions")
      .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
      .filter((q) => q.eq(q.field("userId"), userId))
      .order("desc")
      .collect();
  },
});

/**
 * Get a specific written question set by ID
 */
export const get = query({
  args: { id: v.id("writtenQuestions") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const writtenQuestion = await ctx.db.get(args.id);

    if (!writtenQuestion || writtenQuestion.userId !== userId) {
      return null;
    }

    return writtenQuestion;
  },
});

/**
 * Create a written question set (for contentGeneration.ts)
 */
export const create = mutation({
  args: {
    notebookId: v.id("notebooks"),
    title: v.string(),
    questionType: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const writtenQuestionId = await ctx.db.insert("writtenQuestions", {
      userId,
      notebookId: args.notebookId,
      title: args.title,
      status: "draft",
      questionsData: [],
      questionType: args.questionType,
      metadata: args.metadata || {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return await ctx.db.get("writtenQuestions", writtenQuestionId);
  },
});

/**
 * Internal: Create a written question set (for use by contentGeneration action only).
 * Uses internal so Convex code calls internal.* instead of api.* per best practices.
 */
export const createInternal = internalMutation({
  args: {
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    title: v.string(),
    questionType: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const writtenQuestionId = await ctx.db.insert("writtenQuestions", {
      userId: args.userId,
      notebookId: args.notebookId,
      title: args.title,
      status: "draft",
      questionsData: [],
      questionType: args.questionType,
      metadata: args.metadata || {},
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.get("writtenQuestions", writtenQuestionId);
  },
});

/**
 * Generate written questions for a notebook
 */
export const generateWrittenQuestions = mutation({
  args: {
    notebookId: v.id("notebooks"),
    documentIds: v.array(v.id("documents")),
    questionType: v.string(), // 'short' | 'essay'
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const { notebookId, documentIds, questionType, title } = args;

    // Create written questions record
    const writtenQuestionId = await ctx.db.insert("writtenQuestions", {
      userId,
      notebookId,
      title: title || `Written Questions (${questionType})`,
      status: "generating",
      questionsData: [],
      questionType,
      metadata: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Schedule the generation job
    await ctx.scheduler.runAfter(0, internal.jobs.WrittenQuestionsGenerationJob.writtenQuestionsGeneration, {
      writtenQuestionId,
      userId,
      notebookId,
      documentIds,
      questionType,
      questionCount: 10,
      difficulty: "medium",
      focus: undefined,
    });

    return writtenQuestionId;
  },
});

/**
 * Update a written question set
 */
export const update = mutation({
  args: {
    id: v.id("writtenQuestions"),
    title: v.optional(v.string()),
    questionsData: v.optional(v.array(v.any())),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const { id, metadata, ...otherUpdates } = args;

    // Verify ownership
    const writtenQuestion = await ctx.db.get(id);
    if (!writtenQuestion || writtenQuestion.userId !== userId) {
      throw new Error("Written question set not found or access denied");
    }

    const updateData: any = {
      ...otherUpdates,
      updatedAt: Date.now(),
    };

    // Merge metadata instead of replacing
    if (metadata) {
      updateData.metadata = {
        ...(writtenQuestion.metadata || {}),
        ...metadata,
      };
    }

    await ctx.db.patch(id, updateData);

    return await ctx.db.get(id);
  },
});

/**
 * Update a written question set (legacy)
 */
export const updateWrittenQuestions = mutation({
  args: {
    writtenQuestionId: v.id("writtenQuestions"),
    questionsData: v.optional(v.array(v.any())),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const { writtenQuestionId, questionsData, title } = args;

    // Verify ownership
    const writtenQuestion = await ctx.db.get(writtenQuestionId);
    if (!writtenQuestion || writtenQuestion.userId !== userId) {
      throw new Error("Written question set not found or access denied");
    }

    // Update
    const updates: any = { updatedAt: Date.now() };
    if (questionsData !== undefined) updates.questionsData = questionsData;
    if (title !== undefined) updates.title = title;

    await ctx.db.patch(writtenQuestionId, updates);

    return writtenQuestionId;
  },
});

/**
 * Delete a written question set
 */
export const remove = mutation({
  args: {
    writtenQuestionId: v.id("writtenQuestions"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Verify ownership
    const writtenQuestion = await ctx.db.get(args.writtenQuestionId);
    if (!writtenQuestion || writtenQuestion.userId !== userId) {
      throw new Error("Written question set not found or access denied");
    }

    await ctx.db.delete(args.writtenQuestionId);
  },
});

/**
 * Delete a written question set (alias for remove)
 */
export const deleteWrittenQuestions = mutation({
  args: {
    writtenQuestionId: v.id("writtenQuestions"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Verify ownership
    const writtenQuestion = await ctx.db.get(args.writtenQuestionId);
    if (!writtenQuestion || writtenQuestion.userId !== userId) {
      throw new Error("Written question set not found or access denied");
    }

    await ctx.db.delete(args.writtenQuestionId);
  },
});

/**
 * Internal: Update written question set status
 */
export const updateStatus = internalMutation({
  args: {
    writtenQuestionId: v.id("writtenQuestions"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.writtenQuestionId, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: Update written question set data
 */
export const updateData = internalMutation({
  args: {
    writtenQuestionId: v.id("writtenQuestions"),
    questionsData: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.writtenQuestionId, {
      questionsData: args.questionsData,
      status: "completed",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: Update written question set with partial updates
 */
export const patch = internalMutation({
  args: {
    writtenQuestionId: v.id("writtenQuestions"),
    patch: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.writtenQuestionId, {
      ...args.patch,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: Update a specific user's answer (merges with existing answers)
 */
export const patchUserAnswer = internalMutation({
  args: {
    writtenQuestionId: v.id("writtenQuestions"),
    questionId: v.string(),
    answerData: v.any(),
  },
  handler: async (ctx, args) => {
    const writtenQuestion = await ctx.db.get(args.writtenQuestionId);
    if (!writtenQuestion) {
      throw new Error("Written question set not found");
    }

    // Get existing user answers or initialize empty object
    const existingUserAnswers = (writtenQuestion.metadata as any)?.userAnswers || {};

    // Merge the new answer with existing ones
    await ctx.db.patch(args.writtenQuestionId, {
      metadata: {
        ...writtenQuestion.metadata,
        userAnswers: {
          ...existingUserAnswers,
          [args.questionId]: args.answerData,
        },
      },
      updatedAt: Date.now(),
    });
  },
});
