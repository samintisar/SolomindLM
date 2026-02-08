import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "./auth";
import { checkDailyLimit } from "./lib/limits";
import * as Notebooks from "./model/notebooks";
import * as Slides from "./model/slides";

// List, get, create, update, remove use model functions
export const list = query({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await Slides.listByNotebook(ctx, args.notebookId, userId);
  },
});

export const get = query({
  args: { id: v.id("slides") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const slideDeck = await Slides.getSlideDeck(ctx, args.id);
    if (!slideDeck || slideDeck.userId !== userId) return null;
    return slideDeck;
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
    const notebook = await Notebooks.getNotebook(ctx, args.notebookId);
    if (!notebook || notebook.userId !== userId) throw new Error("Notebook not found");
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
    if (!existing || existing.userId !== userId) throw new Error("Slide deck not found");
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
    if (!slideDeck || slideDeck.userId !== userId) throw new Error("Slide deck not found");
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
      throw new Error("Please select at least one source. Content generation uses only your selected sources.");
    }
    const slideDeckId = await Slides.createSlideDeck(ctx, {
      userId,
      notebookId,
      title: title || "Slide Deck",
      data: {},
      slideCount,
      metadata: {},
      status: "generating",
    });
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
    if (!slideDeck || slideDeck.userId !== userId) throw new Error("Slide deck not found or access denied");
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
    if (!slideDeck || slideDeck.userId !== userId) throw new Error("Slide deck not found or access denied");
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
