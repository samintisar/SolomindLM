import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "./auth";

/**
 * List all slide decks for a notebook
 */
export const list = query({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("slides")
      .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
      .filter((q) => q.eq(q.field("userId"), userId))
      .order("desc")
      .collect();
  },
});

/**
 * Get a specific slide deck by ID
 */
export const get = query({
  args: { id: v.id("slides") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const slideDeck = await ctx.db.get(args.id);

    if (!slideDeck || slideDeck.userId !== userId) {
      return null;
    }

    return slideDeck;
  },
});

/**
 * Create a new slide deck
 */
export const create = mutation({
  args: {
    notebookId: v.id("notebooks"),
    title: v.string(),
    slideCount: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const notebook = await ctx.db.get(args.notebookId);
    if (!notebook || notebook.userId !== userId) {
      throw new Error("Notebook not found");
    }

    const slideDeckId = await ctx.db.insert("slides", {
      userId,
      notebookId: args.notebookId,
      title: args.title,
      status: "draft",
      data: {},
      slideCount: args.slideCount,
      metadata: args.metadata,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return await ctx.db.get(slideDeckId);
  },
});

/**
 * Update a slide deck
 */
export const update = mutation({
  args: {
    id: v.id("slides"),
    title: v.optional(v.string()),
    data: v.optional(v.any()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const { id, ...updates } = args;

    const existing = await ctx.db.get(id);
    if (!existing || existing.userId !== userId) {
      throw new Error("Slide deck not found");
    }

    await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    });

    return await ctx.db.get(id);
  },
});

/**
 * Delete a slide deck
 */
export const remove = mutation({
  args: { id: v.id("slides") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const slideDeck = await ctx.db.get(args.id);
    if (!slideDeck || slideDeck.userId !== userId) {
      throw new Error("Slide deck not found");
    }

    await ctx.db.delete(args.id);

    return { message: "Slide deck deleted successfully" };
  },
});

/**
 * Generate a slide deck for a notebook
 */
export const generateSlideDeck = mutation({
  args: {
    notebookId: v.id("notebooks"),
    documentIds: v.array(v.id("documents")),
    slideCount: v.number(),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const { notebookId, documentIds, slideCount, title } = args;
    if (documentIds.length === 0) {
      throw new Error("Please select at least one source. Content generation uses only your selected sources.");
    }

    // Create slide deck record
    const slideDeckId = await ctx.db.insert("slides", {
      userId,
      notebookId,
      title: title || "Slide Deck",
      data: {},
      status: "generating",
      slideCount,
      metadata: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Schedule the generation job
    await ctx.scheduler.runAfter(0, internal.jobs.SlideDeckGenerationJob.slideDeckGeneration, {
      slideDeckId,
      userId,
      notebookId,
      documentIds,
      slideCount,
    });

    return slideDeckId;
  },
});

/**
 * Update a slide deck
 */
export const updateSlideDeck = mutation({
  args: {
    slideDeckId: v.id("slides"),
    data: v.optional(v.any()),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const { slideDeckId, data, title } = args;

    // Verify ownership
    const slideDeck = await ctx.db.get(slideDeckId);
    if (!slideDeck || slideDeck.userId !== userId) {
      throw new Error("Slide deck not found or access denied");
    }

    // Update
    const updates: any = { updatedAt: Date.now() };
    if (data !== undefined) updates.data = data;
    if (title !== undefined) updates.title = title;

    await ctx.db.patch(slideDeckId, updates);

    return slideDeckId;
  },
});

/**
 * Delete a slide deck
 */
export const deleteSlideDeck = mutation({
  args: {
    slideDeckId: v.id("slides"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Verify ownership
    const slideDeck = await ctx.db.get(args.slideDeckId);
    if (!slideDeck || slideDeck.userId !== userId) {
      throw new Error("Slide deck not found or access denied");
    }

    await ctx.db.delete(args.slideDeckId);
  },
});

/**
 * Internal: Update slide deck status
 */
export const updateStatus = internalMutation({
  args: {
    slideDeckId: v.id("slides"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.slideDeckId, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: Update slide deck data
 */
export const updateData = internalMutation({
  args: {
    slideDeckId: v.id("slides"),
    data: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.slideDeckId, {
      data: args.data,
      status: "completed",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: Update slide deck with partial updates
 */
export const patch = internalMutation({
  args: {
    slideDeckId: v.id("slides"),
    patch: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.slideDeckId, {
      ...args.patch,
      updatedAt: Date.now(),
    });
  },
});
