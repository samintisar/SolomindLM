import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { getAuthUserId } from "../../auth";
import { checkDailyLimit } from "../../_lib/limits";
import { assertCanEditNotebook, assertCanReadNotebook } from "../../_lib/notebookAccess";
import * as Infographics from "../../_model/infographics";

// List, get, create, update, remove use model functions
export const list = query({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    await assertCanReadNotebook(ctx, args.notebookId, userId);
    return await Infographics.listByNotebook(ctx, args.notebookId);
  },
});

export const get = query({
  args: { id: v.id("infographics") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const infographic = await Infographics.getInfographic(ctx, args.id);
    if (!infographic) return null;
    try {
      await assertCanReadNotebook(ctx, infographic.notebookId, userId);
    } catch {
      return null;
    }
    return infographic;
  },
});

/**
 * Internal: Get an infographic by ID (for use by jobs)
 */
export const getInternal = internalQuery({
  args: { id: v.id("infographics") },
  handler: async (ctx, args) => {
    return await Infographics.getInfographic(ctx, args.id);
  },
});

export const create = mutation({
  args: {
    notebookId: v.id("notebooks"),
    title: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    await assertCanEditNotebook(ctx, args.notebookId, userId);
    return await Infographics.createInfographicAndFetch(ctx, {
      userId,
      notebookId: args.notebookId,
      title: args.title,
      metadata: args.metadata,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("infographics"),
    title: v.optional(v.string()),
    data: v.optional(v.any()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const { id, ...updates } = args;
    const existing = await Infographics.getInfographic(ctx, id);
    if (!existing) throw new Error("Infographic not found");
    await assertCanEditNotebook(ctx, existing.notebookId, userId);
    await Infographics.updateInfographic(ctx, id, updates);
    return await Infographics.getInfographic(ctx, id);
  },
});

export const remove = mutation({
  args: { id: v.id("infographics") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const infographic = await Infographics.getInfographic(ctx, args.id);
    if (!infographic) throw new Error("Infographic not found");
    await assertCanEditNotebook(ctx, infographic.notebookId, userId);
    await Infographics.deleteInfographic(ctx, args.id);
    return { message: "Infographic deleted successfully" };
  },
});

export const generateInfographic = mutation({
  args: {
    notebookId: v.id("notebooks"),
    documentIds: v.array(v.id("documents")),
    title: v.optional(v.string()),
    customPrompt: v.optional(v.string()),
    orientation: v.optional(v.union(v.literal("landscape"), v.literal("portrait"), v.literal("square"))),
    visualStyle: v.optional(v.string()),
    detailLevel: v.optional(v.union(v.literal("concise"), v.literal("standard"))),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    await checkDailyLimit(ctx, userId, "infographic");
    const { notebookId, documentIds, title, customPrompt, orientation, visualStyle, detailLevel } = args;
    if (documentIds.length === 0) {
      throw new Error(
        "Please select at least one source. Content generation uses only your selected sources."
      );
    }
    await assertCanEditNotebook(ctx, notebookId, userId);
    const infographicId = await Infographics.createInfographic(ctx, {
      userId,
      notebookId,
      title: title || "Infographic",
      data: {},
      metadata: {
        customPrompt,
        sourceDocumentIds: documentIds,
        orientation,
        visualStyle,
        detailLevel,
      },
      status: "generating",
    });
    await ctx.scheduler.runAfter(0, internal.studio.infographic.generate.generateInfographicImage, {
      infographicId,
      userId,
      notebookId,
      documentIds,
      customPrompt,
      orientation,
      visualStyle,
      detailLevel,
    });
    return infographicId;
  },
});

// Internal mutations delegate to model
export const updateStatus = internalMutation({
  args: { infographicId: v.id("infographics"), status: v.string() },
  handler: async (ctx, args) => {
    await Infographics.updateInfographicStatus(ctx, args.infographicId, args.status);
  },
});

export const updateData = internalMutation({
  args: { infographicId: v.id("infographics"), data: v.any() },
  handler: async (ctx, args) => {
    await Infographics.updateInfographicData(ctx, args.infographicId, args.data);
  },
});

export const patch = internalMutation({
  args: { infographicId: v.id("infographics"), patch: v.any() },
  handler: async (ctx, args) => {
    await Infographics.patchInfographic(ctx, args.infographicId, args.patch);
  },
});
