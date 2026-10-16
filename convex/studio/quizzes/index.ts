import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "../../_generated/server";
import { InputValidationError } from "../../_lib/errors";
import { assertCanEditNotebook, getNotebookAccess } from "../../_lib/notebookAccess";
import { toConvexError } from "../../_lib/serviceErrors";
import { withQuizAnswer } from "../../_model/practiceProgress";
import * as Quizzes from "../../_model/quizzes";
import {
  getPracticeTarget,
  saveViewerProgress,
  viewerPracticeRow,
  viewerPracticeRows,
} from "../../_model/studioProgress";
import { getAuthUserId } from "../../auth";
import { deletePracticeProgress } from "../practice";

/**
 * List all quizzes for a notebook
 */
export const list = query({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const access = await getNotebookAccess(ctx, args.notebookId, userId);
    if (!access) return [];
    const quizzes = await Quizzes.listByNotebook(ctx, args.notebookId);
    // Answers on the shared row are the owner's; a viewer sees their own.
    return access === "viewer"
      ? await viewerPracticeRows(ctx, "quizzes", quizzes, userId, args.notebookId)
      : quizzes;
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

    const access = await getNotebookAccess(ctx, quiz.notebookId, userId);
    if (!access) return null;

    return access === "viewer" ? await viewerPracticeRow(ctx, "quizzes", quiz, userId) : quiz;
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
    await deletePracticeProgress(ctx, { itemId: args.id });

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

    const target = await getPracticeTarget(ctx, quiz.notebookId, userId);
    const questionCount = Array.isArray(quiz.questionsData) ? quiz.questionsData.length : 0;
    if (
      !Number.isInteger(args.questionIndex) ||
      args.questionIndex < 0 ||
      args.questionIndex >= questionCount
    ) {
      throw toConvexError(
        new InputValidationError("Invalid question index", { field: "questionIndex" })
      );
    }
    if (target === "viewer") {
      // A viewer's answer goes to their own progress; the shared quiz is the owner's.
      await saveViewerProgress(
        ctx,
        { userId, itemType: "quizzes", itemId: quiz._id, notebookId: quiz.notebookId },
        (current) => withQuizAnswer(current, args.questionIndex, args.selectedOption)
      );
      return await viewerPracticeRow(ctx, "quizzes", quiz, userId);
    }

    await Quizzes.patchQuizUserAnswer(ctx, args.id, args.questionIndex, args.selectedOption);

    return await Quizzes.getQuiz(ctx, args.id);
  },
});
