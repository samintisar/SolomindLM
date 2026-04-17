import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { getAuthUserId } from "../../auth";
import { checkDailyLimit } from "../../_lib/limits";
import { assertCanEditNotebook, assertCanReadNotebook } from "../../_lib/notebookAccess";
import * as Slides from "../../_model/slides";

// List, get, create, update, remove use model functions
export const list = query({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    await assertCanReadNotebook(ctx, args.notebookId, userId);
    return await Slides.listByNotebook(ctx, args.notebookId);
  },
});

export const get = query({
  args: { id: v.id("slides") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const slideDeck = await Slides.getSlideDeck(ctx, args.id);
    if (!slideDeck) return null;
    try {
      await assertCanReadNotebook(ctx, slideDeck.notebookId, userId);
    } catch {
      return null;
    }
    return slideDeck;
  },
});

/**
 * Internal: Get a slide deck by ID (for use by jobs)
 */
export const getInternal = internalQuery({
  args: { id: v.id("slides") },
  handler: async (ctx, args) => {
    return await Slides.getSlideDeck(ctx, args.id);
  },
});

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
    await assertCanEditNotebook(ctx, args.notebookId, userId);
    return await Slides.createSlideDeckAndFetch(ctx, {
      userId,
      notebookId: args.notebookId,
      title: args.title,
      slideCount: args.slideCount,
      metadata: args.metadata,
    });
  },
});

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
    const existing = await Slides.getSlideDeck(ctx, id);
    if (!existing) throw new Error("Slide deck not found");
    await assertCanEditNotebook(ctx, existing.notebookId, userId);
    await Slides.updateSlideDeck(ctx, id, updates);
    return await Slides.getSlideDeck(ctx, id);
  },
});

export const remove = mutation({
  args: { id: v.id("slides") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const slideDeck = await Slides.getSlideDeck(ctx, args.id);
    if (!slideDeck) throw new Error("Slide deck not found");
    await assertCanEditNotebook(ctx, slideDeck.notebookId, userId);
    await Slides.deleteSlideDeck(ctx, args.id);
    return { message: "Slide deck deleted successfully" };
  },
});

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
    await checkDailyLimit(ctx, userId, "slide");
    const { notebookId, documentIds, slideCount, title } = args;
    if (documentIds.length === 0) {
      throw new Error(
        "Please select at least one source. Content generation uses only your selected sources."
      );
    }
    await assertCanEditNotebook(ctx, notebookId, userId);
    const slideDeckId = await Slides.createSlideDeck(ctx, {
      userId,
      notebookId,
      title: title || "Slide Deck",
      data: {},
      slideCount,
      metadata: {},
      status: "generating",
    });
    await ctx.scheduler.runAfter(0, internal.studio.slides.job.slideDeckGeneration, {
      slideDeckId,
      userId,
      notebookId,
      documentIds,
      slideCount,
    });
    return slideDeckId;
  },
});

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
    const slideDeck = await Slides.getSlideDeck(ctx, slideDeckId);
    if (!slideDeck) throw new Error("Slide deck not found or access denied");
    await assertCanEditNotebook(ctx, slideDeck.notebookId, userId);
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (data !== undefined) updates.data = data;
    if (title !== undefined) updates.title = title;
    await Slides.updateSlideDeck(ctx, slideDeckId, updates);
    return slideDeckId;
  },
});

export const deleteSlideDeck = mutation({
  args: { slideDeckId: v.id("slides") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const slideDeck = await Slides.getSlideDeck(ctx, args.slideDeckId);
    if (!slideDeck) throw new Error("Slide deck not found or access denied");
    await assertCanEditNotebook(ctx, slideDeck.notebookId, userId);
    await Slides.deleteSlideDeck(ctx, args.slideDeckId);
  },
});

// Internal mutations delegate to model
export const updateStatus = internalMutation({
  args: { slideDeckId: v.id("slides"), status: v.string() },
  handler: async (ctx, args) => {
    await Slides.updateSlideDeckStatus(ctx, args.slideDeckId, args.status);
  },
});

export const updateData = internalMutation({
  args: { slideDeckId: v.id("slides"), data: v.any() },
  handler: async (ctx, args) => {
    await Slides.updateSlideDeckData(ctx, args.slideDeckId, args.data);
  },
});

export const patch = internalMutation({
  args: { slideDeckId: v.id("slides"), patch: v.any() },
  handler: async (ctx, args) => {
    await Slides.patchSlideDeck(ctx, args.slideDeckId, args.patch);
  },
});
