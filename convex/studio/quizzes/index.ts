import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "../../_generated/server";
import { getAuthUserId } from "../../auth";
import { assertCanEditNotebook, assertCanReadNotebook } from "../../_lib/notebookAccess";
import * as Quizzes from "../../_model/quizzes";

/**
 * List all quizzes for a notebook
 */
export const list = query({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    await assertCanReadNotebook(ctx, args.notebookId, userId);
    return await Quizzes.listByNotebook(ctx, args.notebookId);
  },
});

/**
 * Get a specific quiz by ID
 */
export const get = query({
  args: { id: v.id("quizzes") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const quiz = await Quizzes.getQuiz(ctx, args.id);

    if (!quiz) {
      return null;
    }

    try {
      await assertCanReadNotebook(ctx, quiz.notebookId, userId);
    } catch {
      return null;
    }

    return quiz;
  },
});

/**
 * Create a new quiz
 */
export const create = mutation({
  args: {
    notebookId: v.id("notebooks"),
    title: v.string(),
    questionsData: v.optional(v.array(v.any())),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    await assertCanEditNotebook(ctx, args.notebookId, userId);

    return await Quizzes.createQuizAndFetch(ctx, {
      userId,
      notebookId: args.notebookId,
      title: args.title,
      questionsData: args.questionsData,
      metadata: args.metadata,
    });
  },
});

/**
 * Internal: Create a quiz (for use by contentGeneration action only).
 * Uses internal so Convex code calls internal.* instead of api.* per best practices.
 */
export const createInternal = internalMutation({
  args: {
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    title: v.string(),
    questionsData: v.optional(v.array(v.any())),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await assertCanEditNotebook(ctx, args.notebookId, args.userId);
    return await Quizzes.createQuizAndFetch(ctx, {
      userId: args.userId,
      notebookId: args.notebookId,
      title: args.title,
      questionsData: args.questionsData,
      metadata: args.metadata,
    });
  },
});

/**
 * Internal: Get a quiz by ID (for use by jobs)
 */
export const getInternal = internalQuery({
  args: { id: v.id("quizzes") },
  handler: async (ctx, args) => {
    return await Quizzes.getQuiz(ctx, args.id);
  },
});

/**
 * Update a quiz
 */
export const update = mutation({
  args: {
    id: v.id("quizzes"),
    title: v.optional(v.string()),
    status: v.optional(v.string()),
    questionsData: v.optional(v.array(v.any())),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const { id, ...rest } = args;
    const metadata = rest.metadata;
    const otherUpdates: Omit<typeof rest, "metadata"> = rest;

    const existing = await Quizzes.getQuiz(ctx, id);
    if (!existing) {
      throw new Error("Quiz not found");
    }

    await assertCanEditNotebook(ctx, existing.notebookId, userId);

    await Quizzes.updateQuiz(ctx, id, otherUpdates, !!metadata);

    // Merge metadata if provided
    if (metadata) {
      await Quizzes.patchQuiz(ctx, id, { metadata });
    }

    return await Quizzes.getQuiz(ctx, id);
  },
});

/**
 * Delete a quiz
 */
export const remove = mutation({
  args: { id: v.id("quizzes") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const quiz = await Quizzes.getQuiz(ctx, args.id);
    if (!quiz) {
      throw new Error("Quiz not found");
    }

    await assertCanEditNotebook(ctx, quiz.notebookId, userId);

    await Quizzes.deleteQuiz(ctx, args.id);

    return { message: "Quiz deleted successfully" };
  },
});

/**
 * Internal: Update quiz status
 */
export const updateStatus = internalMutation({
  args: {
    quizId: v.id("quizzes"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    await Quizzes.updateQuizStatus(ctx, args.quizId, args.status);
  },
});

/**
 * Internal: Update quiz data
 */
export const updateData = internalMutation({
  args: {
    quizId: v.id("quizzes"),
    questionsData: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    await Quizzes.updateQuizData(ctx, args.quizId, args.questionsData);
  },
});

/**
 * Internal: Update quiz with partial updates
 */
export const patch = internalMutation({
  args: {
    quizId: v.id("quizzes"),
    patch: v.any(),
  },
  handler: async (ctx, args) => {
    await Quizzes.patchQuiz(ctx, args.quizId, args.patch);
  },
});

/**
 * Internal: Update a specific user's answer (merges with existing answers)
 * Follows the same pattern as writtenQuestions.patchUserAnswer
 */
export const patchUserAnswer = internalMutation({
  args: {
    quizId: v.id("quizzes"),
    questionIndex: v.number(),
    selectedOption: v.number(),
  },
  handler: async (ctx, args) => {
    await Quizzes.patchQuizUserAnswer(ctx, args.quizId, args.questionIndex, args.selectedOption);
  },
});

/**
 * Submit an answer for a quiz question
 * Merges the new answer with existing answers (does not replace them)
 */
export const submitAnswer = mutation({
  args: {
    id: v.id("quizzes"),
    questionIndex: v.number(),
    selectedOption: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const quiz = await Quizzes.getQuiz(ctx, args.id);
    if (!quiz) {
      throw new Error("Quiz not found");
    }

    await assertCanEditNotebook(ctx, quiz.notebookId, userId);

    await Quizzes.patchQuizUserAnswer(ctx, args.id, args.questionIndex, args.selectedOption);

    return await Quizzes.getQuiz(ctx, args.id);
  },
});
