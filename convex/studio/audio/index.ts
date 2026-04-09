import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { internal } from "../../_generated/api";
import { getAuthUserId } from "../../auth";
import { checkDailyLimit } from "../../_lib/limits";
import {
  assertCanEditNotebook,
  assertCanReadNotebook,
} from "../../_lib/notebookAccess";
import * as AudioOverviews from "../../_model/audioOverviews";

/**
 * List all audio overviews for a notebook
 */
export const list = query({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    await assertCanReadNotebook(ctx, args.notebookId, userId);
    return await AudioOverviews.listByNotebook(ctx, args.notebookId);
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

    const audioOverview = await AudioOverviews.getAudioOverview(ctx, args.id);

    if (!audioOverview) {
      return null;
    }

    try {
      await assertCanReadNotebook(ctx, audioOverview.notebookId, userId);
    } catch {
      return null;
    }

    return audioOverview;
  },
});

/**
 * HTTPS URL for playback (uses `storage.getUrl` for legacy `/audio/<storageId>` values).
 */
export const resolvePlaybackUrl = query({
  args: { audioOverviewId: v.id("audioOverviews") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const overview = await AudioOverviews.getAudioOverview(ctx, args.audioOverviewId);
    if (!overview?.audioUrl?.trim()) return null;

    try {
      await assertCanReadNotebook(ctx, overview.notebookId, userId);
    } catch {
      return null;
    }

    const raw = overview.audioUrl.trim();
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      return { url: raw };
    }

    let storageId = raw;
    if (storageId.startsWith("/audio/")) storageId = storageId.slice("/audio/".length);
    else if (storageId.startsWith("audio/")) storageId = storageId.slice("audio/".length);
    if (storageId.startsWith("/")) storageId = storageId.slice(1);

    const url = await ctx.storage.getUrl(storageId as Id<"_storage">);
    return url ? { url } : null;
  },
});

/**
 * Internal: Get an audio overview by ID (for use by jobs)
 */
export const getInternal = internalQuery({
  args: { id: v.id("audioOverviews") },
  handler: async (ctx, args) => {
    return await AudioOverviews.getAudioOverview(ctx, args.id);
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

    await assertCanEditNotebook(ctx, args.notebookId, userId);

    return await AudioOverviews.createAudioOverviewAndFetch(ctx, {
      userId,
      notebookId: args.notebookId,
      title: args.title,
      metadata: args.metadata,
    });
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

    const existing = await AudioOverviews.getAudioOverview(ctx, id);
    if (!existing) {
      throw new Error("Audio overview not found");
    }

    await assertCanEditNotebook(ctx, existing.notebookId, userId);

    await AudioOverviews.updateAudioOverview(ctx, id, updates);

    return await AudioOverviews.getAudioOverview(ctx, id);
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

    const audioOverview = await AudioOverviews.getAudioOverview(ctx, args.id);
    if (!audioOverview) {
      throw new Error("Audio overview not found");
    }

    await assertCanEditNotebook(ctx, audioOverview.notebookId, userId);

    await AudioOverviews.deleteAudioOverview(ctx, args.id);

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
    audioType: v.optional(v.string()),
    length: v.optional(v.string()),
    focus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Check daily audio limit
    await checkDailyLimit(ctx, userId, "audio");

    const { notebookId, documentIds, title, audioType, length, focus } = args;
    if (documentIds.length === 0) {
      throw new Error("Please select at least one source. Content generation uses only your selected sources.");
    }

    await assertCanEditNotebook(ctx, notebookId, userId);

    // Create audio overview record
    const audioOverviewId = await AudioOverviews.createAudioOverview(ctx, {
      userId,
      notebookId,
      title: title || "Audio Overview",
      metadata: {
        audioType: audioType || "deep_dive",
        length: length || "default",
        focus: focus?.trim() || undefined,
      },
      status: "generating",
    });

    // Schedule the generation job
    await ctx.scheduler.runAfter(0, internal.studio.audio.job.audioOverviewGeneration, {
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

    const audioOverview = await AudioOverviews.getAudioOverview(ctx, audioOverviewId);
    if (!audioOverview) {
      throw new Error("Audio overview not found or access denied");
    }

    await assertCanEditNotebook(ctx, audioOverview.notebookId, userId);

    // Update
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (transcript !== undefined) updates.transcript = transcript;
    if (audioUrl !== undefined) updates.audioUrl = audioUrl;
    if (title !== undefined) updates.title = title;

    await AudioOverviews.updateAudioOverview(ctx, audioOverviewId, updates);

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

    const audioOverview = await AudioOverviews.getAudioOverview(ctx, args.audioOverviewId);
    if (!audioOverview) {
      throw new Error("Audio overview not found or access denied");
    }

    await assertCanEditNotebook(ctx, audioOverview.notebookId, userId);

    await AudioOverviews.deleteAudioOverview(ctx, args.audioOverviewId);
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
    await AudioOverviews.updateAudioOverviewStatus(ctx, args.audioOverviewId, args.status);
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
    await AudioOverviews.updateAudioOverviewData(ctx, args.audioOverviewId, args.transcript, args.audioUrl);
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
    await AudioOverviews.patchAudioOverview(ctx, args.audioOverviewId, args.patch);
  },
});
