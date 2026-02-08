import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "./auth";
import * as WrittenQuestions from "./model/writtenQuestions";

export const list = query({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await WrittenQuestions.listByNotebook(ctx, args.notebookId, userId);
  },
});

export const get = query({
  args: { id: v.id("writtenQuestions") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const writtenQuestion = await WrittenQuestions.getWrittenQuestion(ctx, args.id);
    if (!writtenQuestion || writtenQuestion.userId !== userId) return null;
    return writtenQuestion;
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
    return await WrittenQuestions.createWrittenQuestionAndFetch(ctx, {
      userId: args.userId,
      notebookId: args.notebookId,
      title: args.title,
      questionType: args.questionType,
      metadata: args.metadata,
    });
  },
});

export const generateWrittenQuestions = mutation({
  args: {
    notebookId: v.id("notebooks"),
    documentIds: v.array(v.id("documents")),
    questionType: v.string(),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const { notebookId, documentIds, questionType, title } = args;
    const writtenQuestionId = await WrittenQuestions.createWrittenQuestion(ctx, {
      userId,
      notebookId,
      title: title || `Written Questions (${questionType})`,
      questionType,
      status: "generating",
    });
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
    if (!existing || existing.userId !== userId) throw new Error("Written question set not found or access denied");
    await WrittenQuestions.updateWrittenQuestion(ctx, id, otherUpdates, !!metadata);
    if (metadata) {
      await WrittenQuestions.patchWrittenQuestion(ctx, id, { metadata });
    }
    return await WrittenQuestions.getWrittenQuestion(ctx, id);
  },
});

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
    const writtenQuestion = await WrittenQuestions.getWrittenQuestion(ctx, writtenQuestionId);
    if (!writtenQuestion || writtenQuestion.userId !== userId) throw new Error("Written question set not found or access denied");
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (questionsData !== undefined) updates.questionsData = questionsData;
    if (title !== undefined) updates.title = title;
    await WrittenQuestions.updateWrittenQuestion(ctx, writtenQuestionId, updates);
    return writtenQuestionId;
  },
});

export const remove = mutation({
  args: { writtenQuestionId: v.id("writtenQuestions") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const writtenQuestion = await WrittenQuestions.getWrittenQuestion(ctx, args.writtenQuestionId);
    if (!writtenQuestion || writtenQuestion.userId !== userId) throw new Error("Written question set not found or access denied");
    await WrittenQuestions.deleteWrittenQuestion(ctx, args.writtenQuestionId);
  },
});

export const deleteWrittenQuestions = remove;

export const updateStatus = internalMutation({
  args: { writtenQuestionId: v.id("writtenQuestions"), status: v.string() },
  handler: async (ctx, args) => {
    await WrittenQuestions.updateWrittenQuestionStatus(ctx, args.writtenQuestionId, args.status);
  },
});

export const updateData = internalMutation({
  args: { writtenQuestionId: v.id("writtenQuestions"), questionsData: v.array(v.any()) },
  handler: async (ctx, args) => {
    await WrittenQuestions.updateWrittenQuestionData(ctx, args.writtenQuestionId, args.questionsData);
  },
});

export const patch = internalMutation({
  args: { writtenQuestionId: v.id("writtenQuestions"), patch: v.any() },
  handler: async (ctx, args) => {
    await WrittenQuestions.patchWrittenQuestion(ctx, args.writtenQuestionId, args.patch);
  },
});

export const patchUserAnswer = internalMutation({
  args: {
    writtenQuestionId: v.id("writtenQuestions"),
    questionId: v.string(),
    answerData: v.any(),
  },
  handler: async (ctx, args) => {
    await WrittenQuestions.patchWrittenQuestionUserAnswer(ctx, args.writtenQuestionId, args.questionId, args.answerData);
  },
});
