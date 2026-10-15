import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalMutation, internalQuery, mutation, query } from "../../_generated/server";
import { assertCanEditNotebook, getNotebookAccess } from "../../_lib/notebookAccess";
import { withWrittenAnswer, withWrittenDraft } from "../../_model/practiceProgress";
import {
  getPracticeTarget,
  saveViewerProgress,
  viewerPracticeRow,
  viewerPracticeRows,
} from "../../_model/studioProgress";
import * as WrittenQuestions from "../../_model/writtenQuestions";
import { getAuthUserId } from "../../auth";
import { deletePracticeProgress } from "../practice";

const MAX_DRAFT_ANSWER_LENGTH = 50_000;

export const list = query({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const access = await getNotebookAccess(ctx, args.notebookId, userId);
    if (!access) return [];
    const sets = await WrittenQuestions.listByNotebook(ctx, args.notebookId);
    // Answers and grades on the shared row are the owner's; a viewer sees their own.
    return access === "viewer"
      ? await viewerPracticeRows(ctx, "writtenQuestions", sets, userId, args.notebookId)
      : sets;
  },
});

export const get = query({
  args: { id: v.id("writtenQuestions") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const writtenQuestion = await WrittenQuestions.getWrittenQuestion(ctx, args.id);
    if (!writtenQuestion) return null;
    const access = await getNotebookAccess(ctx, writtenQuestion.notebookId, userId);
    if (!access) return null;
    return access === "viewer"
      ? await viewerPracticeRow(ctx, "writtenQuestions", writtenQuestion, userId)
      : writtenQuestion;
  },
});

/**
 * Internal: Get written questions by ID (for use by jobs)
 */
export const getInternal = internalQuery({
  args: { id: v.id("writtenQuestions") },
  handler: async (ctx, args) => {
    return await WrittenQuestions.getWrittenQuestion(ctx, args.id);
  },
});

/**
 * Internal: Load a written-question set for someone who may practise on it: the owner, an editor
 * or a public notebook's viewer (actions without query auth). Throws for anyone else.
 */
export const getWrittenQuestionForUserInternal = internalQuery({
  args: { id: v.id("writtenQuestions"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const wq = await WrittenQuestions.getWrittenQuestion(ctx, args.id);
    if (!wq) return null;
    await getPracticeTarget(ctx, wq.notebookId, args.userId);
    return wq;
  },
});

export const create = mutation({
  args: {
    notebookId: v.id("notebooks"),
    title: v.string(),
    questionType: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    await assertCanEditNotebook(ctx, args.notebookId, userId);
    return await WrittenQuestions.createWrittenQuestionAndFetch(ctx, {
      userId,
      notebookId: args.notebookId,
      title: args.title,
      questionType: args.questionType,
      metadata: args.metadata,
    });
  },
});

export const createInternal = internalMutation({
  args: {
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    title: v.string(),
    questionType: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await assertCanEditNotebook(ctx, args.notebookId, args.userId);
    return await WrittenQuestions.createWrittenQuestionAndFetch(ctx, {
      userId: args.userId,
      notebookId: args.notebookId,
      title: args.title,
      questionType: args.questionType,
      metadata: args.metadata,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("writtenQuestions"),
    title: v.optional(v.string()),
    questionsData: v.optional(v.array(v.any())),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const { id, ...rest } = args;
    const metadata = rest.metadata;
    const otherUpdates: Omit<typeof rest, "metadata"> = rest;
    const existing = await WrittenQuestions.getWrittenQuestion(ctx, id);
    if (!existing) throw new Error("Written question set not found or access denied");
    await assertCanEditNotebook(ctx, existing.notebookId, userId);
    await WrittenQuestions.updateWrittenQuestion(ctx, id, otherUpdates, !!metadata);
    if (metadata) {
      await WrittenQuestions.patchWrittenQuestion(ctx, id, { metadata });
    }
    return await WrittenQuestions.getWrittenQuestion(ctx, id);
  },
});

/**
 * Persist a single question's draft answer text (no grading). Used by the
 * client's debounced autosave so typed-but-unsubmitted answers survive reload.
 */
export const saveUserAnswerDraft = mutation({
  args: {
    id: v.id("writtenQuestions"),
    questionId: v.string(),
    answer: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const existing = await WrittenQuestions.getWrittenQuestion(ctx, args.id);
    if (!existing) throw new Error("Written question set not found or access denied");
    const target = await getPracticeTarget(ctx, existing.notebookId, userId);
    const known = (existing.questionsData ?? []).some(
      (q: { id?: string }) => q?.id === args.questionId
    );
    if (!known) throw new Error("Question not found");
    if (args.answer.length > MAX_DRAFT_ANSWER_LENGTH) {
      throw new Error("Answer is too long to save");
    }
    if (target === "viewer") {
      await saveViewerProgress(
        ctx,
        {
          userId,
          itemType: "writtenQuestions",
          itemId: existing._id,
          notebookId: existing.notebookId,
        },
        (current) => withWrittenDraft(current, args.questionId, args.answer)
      );
      return;
    }
    await WrittenQuestions.saveWrittenQuestionUserAnswerDraft(
      ctx,
      existing,
      args.questionId,
      args.answer
    );
  },
});

export const remove = mutation({
  args: { writtenQuestionId: v.id("writtenQuestions") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const writtenQuestion = await WrittenQuestions.getWrittenQuestion(ctx, args.writtenQuestionId);
    if (!writtenQuestion) throw new Error("Written question set not found or access denied");
    await assertCanEditNotebook(ctx, writtenQuestion.notebookId, userId);
    await WrittenQuestions.deleteWrittenQuestion(ctx, args.writtenQuestionId);
    await deletePracticeProgress(ctx, { itemId: args.writtenQuestionId });
  },
});

export const updateStatus = internalMutation({
  args: { writtenQuestionId: v.id("writtenQuestions"), status: v.string() },
  handler: async (ctx, args) => {
    await WrittenQuestions.updateWrittenQuestionStatus(ctx, args.writtenQuestionId, args.status);
  },
});

export const updateData = internalMutation({
  args: { writtenQuestionId: v.id("writtenQuestions"), questionsData: v.array(v.any()) },
  handler: async (ctx, args) => {
    await WrittenQuestions.updateWrittenQuestionData(
      ctx,
      args.writtenQuestionId,
      args.questionsData
    );
  },
});

export const patch = internalMutation({
  args: { writtenQuestionId: v.id("writtenQuestions"), patch: v.any() },
  handler: async (ctx, args) => {
    await WrittenQuestions.patchWrittenQuestion(ctx, args.writtenQuestionId, args.patch);
  },
});

/**
 * Internal: Record one answer's grading state for `userId`: on the shared set for the owner and
 * editors, in their own progress for a public notebook's viewer.
 */
export const patchUserAnswer = internalMutation({
  args: {
    writtenQuestionId: v.id("writtenQuestions"),
    userId: v.id("users"),
    questionId: v.string(),
    answerData: v.any(),
  },
  handler: async (ctx, args) => {
    const set = await WrittenQuestions.getWrittenQuestion(ctx, args.writtenQuestionId);
    if (!set) throw new Error("Written question set not found");
    const target = await getPracticeTarget(ctx, set.notebookId, args.userId);
    if (target === "viewer") {
      await saveViewerProgress(
        ctx,
        {
          userId: args.userId,
          itemType: "writtenQuestions",
          itemId: set._id,
          notebookId: set.notebookId,
        },
        (current) => withWrittenAnswer(current, args.questionId, args.answerData)
      );
      return;
    }
    await WrittenQuestions.patchWrittenQuestionUserAnswer(
      ctx,
      args.writtenQuestionId,
      args.questionId,
      args.answerData
    );
  },
});
