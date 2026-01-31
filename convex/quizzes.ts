import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { getAuthUserId } from "./auth";

/**
 * List all quizzes for a notebook
 */
export const list = query({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("quizzes")
      .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
      .filter((q) => q.eq(q.field("userId"), userId))
      .order("desc")
      .collect();
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

    const quiz = await ctx.db.get(args.id);

    if (!quiz || quiz.userId !== userId) {
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

    // Verify user owns the notebook
    const notebook = await ctx.db.get(args.notebookId);
    if (!notebook || notebook.userId !== userId) {
      throw new Error("Notebook not found");
    }

    const now = Date.now();

    const quizId = await ctx.db.insert("quizzes", {
      userId,
      notebookId: args.notebookId,
      title: args.title,
      status: "draft",
      questionsData: args.questionsData || [],
      metadata: args.metadata,
      createdAt: now,
      updatedAt: now,
    });

    return await ctx.db.get("quizzes", quizId);
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
    const now = Date.now();
    const quizId = await ctx.db.insert("quizzes", {
      userId: args.userId,
      notebookId: args.notebookId,
      title: args.title,
      status: "draft",
      questionsData: args.questionsData || [],
      metadata: args.metadata,
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.get("quizzes", quizId);
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

    const { id, ...updates } = args;

    // Verify ownership
    const existing = await ctx.db.get(id);
    if (!existing || existing.userId !== userId) {
      throw new Error("Quiz not found");
    }

    const updateData: any = {
      ...updates,
      updatedAt: Date.now(),
    };

    await ctx.db.patch(id, updateData);

    return await ctx.db.get(id);
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

    const quiz = await ctx.db.get(args.id);
    if (!quiz || quiz.userId !== userId) {
      throw new Error("Quiz not found");
    }

    await ctx.db.delete(args.id);

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
    await ctx.db.patch(args.quizId, {
      status: args.status,
      updatedAt: Date.now(),
    });
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
    await ctx.db.patch(args.quizId, {
      questionsData: args.questionsData,
      status: "completed",
      updatedAt: Date.now(),
    });
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
    await ctx.db.patch(args.quizId, {
      ...args.patch,
      updatedAt: Date.now(),
    });
  },
});
