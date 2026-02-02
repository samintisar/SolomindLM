import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { getAuthUserId } from "./auth";

/**
 * List all flashcards for a notebook
 */
export const list = query({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("flashcards")
      .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
      .filter((q) => q.eq(q.field("userId"), userId))
      .order("desc")
      .collect();
  },
});

/**
 * Get a specific flashcard set by ID
 */
export const get = query({
  args: { id: v.id("flashcards") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const flashcard = await ctx.db.get(args.id);

    if (!flashcard || flashcard.userId !== userId) {
      return null;
    }

    return flashcard;
  },
});

/**
 * Create a new flashcard set
 */
export const create = mutation({
  args: {
    notebookId: v.id("notebooks"),
    title: v.string(),
    cardsData: v.optional(v.array(v.any())),
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

    const flashcardId = await ctx.db.insert("flashcards", {
      userId,
      notebookId: args.notebookId,
      title: args.title,
      status: "draft",
      cardsData: args.cardsData || [],
      metadata: args.metadata,
      createdAt: now,
      updatedAt: now,
    });

    return await ctx.db.get("flashcards", flashcardId);
  },
});

/**
 * Internal: Create a flashcard set (for use by contentGeneration action only).
 * Uses internal so Convex code calls internal.* instead of api.* per best practices.
 */
export const createInternal = internalMutation({
  args: {
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    title: v.string(),
    cardsData: v.optional(v.array(v.any())),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const flashcardId = await ctx.db.insert("flashcards", {
      userId: args.userId,
      notebookId: args.notebookId,
      title: args.title,
      status: "draft",
      cardsData: args.cardsData || [],
      metadata: args.metadata,
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.get("flashcards", flashcardId);
  },
});

/**
 * Update a flashcard set
 */
export const update = mutation({
  args: {
    id: v.id("flashcards"),
    title: v.optional(v.string()),
    status: v.optional(v.string()),
    cardsData: v.optional(v.array(v.any())),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const { id, metadata, ...otherUpdates } = args;

    // Verify ownership
    const existing = await ctx.db.get(id);
    if (!existing || existing.userId !== userId) {
      throw new Error("Flashcard set not found");
    }

    const updateData: any = {
      ...otherUpdates,
      updatedAt: Date.now(),
    };

    // Merge metadata instead of replacing
    if (metadata) {
      updateData.metadata = {
        ...(existing.metadata || {}),
        ...metadata,
      };
    }

    await ctx.db.patch(id, updateData);

    return await ctx.db.get(id);
  },
});

/**
 * Delete a flashcard set
 */
export const remove = mutation({
  args: { id: v.id("flashcards") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const flashcard = await ctx.db.get(args.id);
    if (!flashcard || flashcard.userId !== userId) {
      throw new Error("Flashcard set not found");
    }

    await ctx.db.delete(args.id);

    return { message: "Flashcard set deleted successfully" };
  },
});

/**
 * Internal: Update flashcard set status
 */
export const updateStatus = internalMutation({
  args: {
    flashcardId: v.id("flashcards"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.flashcardId, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: Update flashcard set data
 */
export const updateData = internalMutation({
  args: {
    flashcardId: v.id("flashcards"),
    cardsData: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.flashcardId, {
      cardsData: args.cardsData,
      status: "completed",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: Update flashcard set with partial updates
 */
export const patch = internalMutation({
  args: {
    flashcardId: v.id("flashcards"),
    patch: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.flashcardId, {
      ...args.patch,
      updatedAt: Date.now(),
    });
  },
});
