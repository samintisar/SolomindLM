import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "./auth";
import { checkDailyLimit } from "./lib/limits";

/**
 * List all audio overviews for a notebook
 */
export const list = query({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("audioOverviews")
      .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
      .filter((q) => q.eq(q.field("userId"), userId))
      .order("desc")
      .collect();
  },
});

/**
 * Get a specific audio overview by ID
 */
export const get = query({
  args: { id: v.id("audioOverviews") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const audioOverview = await ctx.db.get(args.id);

    if (!audioOverview || audioOverview.userId !== userId) {
      return null;
    }

    return audioOverview;
  },
});

/**
 * Create a new audio overview
 */
export const create = mutation({
  args: {
    notebookId: v.id("notebooks"),
    title: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const notebook = await ctx.db.get(args.notebookId);
    if (!notebook || notebook.userId !== userId) {
      throw new Error("Notebook not found");
    }

    const audioOverviewId = await ctx.db.insert("audioOverviews", {
      userId,
      notebookId: args.notebookId,
      title: args.title,
      status: "draft",
      metadata: args.metadata,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return await ctx.db.get(audioOverviewId);
  },
});

/**
 * Update an audio overview
 */
export const update = mutation({
  args: {
    id: v.id("audioOverviews"),
    title: v.optional(v.string()),
    transcript: v.optional(v.string()),
    audioUrl: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const { id, ...updates } = args;

    const existing = await ctx.db.get(id);
    if (!existing || existing.userId !== userId) {
      throw new Error("Audio overview not found");
    }

    await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    });

    return await ctx.db.get(id);
  },
});

/**
 * Delete an audio overview
 */
export const remove = mutation({
  args: { id: v.id("audioOverviews") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const audioOverview = await ctx.db.get(args.id);
    if (!audioOverview || audioOverview.userId !== userId) {
      throw new Error("Audio overview not found");
    }

    await ctx.db.delete(args.id);

    return { message: "Audio overview deleted successfully" };
  },
});

/**
 * Generate an audio overview for a notebook
 */
export const generateAudioOverview = mutation({
  args: {
    notebookId: v.id("notebooks"),
    documentIds: v.array(v.id("documents")),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Check daily audio limit
    await checkDailyLimit(ctx, userId, "audio");

    const { notebookId, documentIds, title } = args;
    if (documentIds.length === 0) {
      throw new Error("Please select at least one source. Content generation uses only your selected sources.");
    }

    // Create audio overview record
    const audioOverviewId = await ctx.db.insert("audioOverviews", {
      userId,
      notebookId,
      title: title || "Audio Overview",
      status: "generating",
      metadata: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Schedule the generation job
    await ctx.scheduler.runAfter(0, internal.jobs.AudioOverviewGenerationJob.audioOverviewGeneration, {
      audioOverviewId,
      userId,
      notebookId,
      documentIds,
    });

    return audioOverviewId;
  },
});

/**
 * Update an audio overview
 */
export const updateAudioOverview = mutation({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    transcript: v.optional(v.string()),
    audioUrl: v.optional(v.string()),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const { audioOverviewId, transcript, audioUrl, title } = args;

    // Verify ownership
    const audioOverview = await ctx.db.get(audioOverviewId);
    if (!audioOverview || audioOverview.userId !== userId) {
      throw new Error("Audio overview not found or access denied");
    }

    // Update
    const updates: any = { updatedAt: Date.now() };
    if (transcript !== undefined) updates.transcript = transcript;
    if (audioUrl !== undefined) updates.audioUrl = audioUrl;
    if (title !== undefined) updates.title = title;

    await ctx.db.patch(audioOverviewId, updates);

    return audioOverviewId;
  },
});

/**
 * Delete an audio overview
 */
export const deleteAudioOverview = mutation({
  args: {
    audioOverviewId: v.id("audioOverviews"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Verify ownership
    const audioOverview = await ctx.db.get(args.audioOverviewId);
    if (!audioOverview || audioOverview.userId !== userId) {
      throw new Error("Audio overview not found or access denied");
    }

    await ctx.db.delete(args.audioOverviewId);
  },
});

/**
 * Internal: Update audio overview status
 */
export const updateStatus = internalMutation({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.audioOverviewId, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: Update audio overview data
 */
export const updateData = internalMutation({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    transcript: v.string(),
    audioUrl: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.audioOverviewId, {
      transcript: args.transcript,
      audioUrl: args.audioUrl,
      status: "completed",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: Update audio overview with partial updates
 */
export const patch = internalMutation({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    patch: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.audioOverviewId, {
      ...args.patch,
      updatedAt: Date.now(),
    });
  },
});
