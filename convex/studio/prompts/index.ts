import { v } from "convex/values";
import { mutation, query } from "../../_generated/server";
import { getAuthUserId } from "../../auth";
import { paginationOptsValidator } from "convex/server";
import {
  PROMPT_TEXT_MAX_LENGTH,
  PROMPT_TITLE_MAX_LENGTH,
  PROMPT_DESCRIPTION_MAX_LENGTH,
  PROMPT_REPORT_AUTO_HIDE_THRESHOLD,
  RATING_PRIOR_MEAN,
  RATING_PRIOR_COUNT,
  studioToolValidator,
} from "./config";
import type { StudioTool } from "./config";
import type { Id } from "../../_generated/dataModel";

// ── Helpers ────────────────────────────────────────────────────────────

function computeBayesianRating(ratingSum: number, ratingCount: number): number {
  return (ratingSum + RATING_PRIOR_MEAN * RATING_PRIOR_COUNT) / (ratingCount + RATING_PRIOR_COUNT);
}

// ── Queries ────────────────────────────────────────────────────────────

/** List active public prompts, sorted by saves, rating, or newest. */
export const listPublicPrompts = query({
  args: {
    studioTool: studioToolValidator,
    sortBy: v.optional(v.union(v.literal("saves"), v.literal("rating"), v.literal("newest"))),
    query: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const sortBy = args.sortBy ?? "saves";
    const query = args.query?.trim();

    // Text search path
    if (query) {
      const results = await ctx.db
        .query("studioPrompts")
        .withSearchIndex("search_title", (q) =>
          q.search("title", query).eq("studioTool", args.studioTool).eq("visibility", "public").eq("status", "active"),
        )
        .paginate(args.paginationOpts);
      return results;
    }

    // Indexed sort path
    const order = "desc" as const;

    if (sortBy === "saves") {
      return await ctx.db
        .query("studioPrompts")
        .withIndex("by_visibility_and_status_and_studioTool_and_saveCount", (q) =>
          q.eq("visibility", "public").eq("status", "active").eq("studioTool", args.studioTool),
        )
        .order(order)
        .paginate(args.paginationOpts);
    }

    if (sortBy === "rating") {
      return await ctx.db
        .query("studioPrompts")
        .withIndex("by_visibility_and_status_and_studioTool_and_bayesianRating", (q) =>
          q.eq("visibility", "public").eq("status", "active").eq("studioTool", args.studioTool),
        )
        .order(order)
        .paginate(args.paginationOpts);
    }

    // newest
    return await ctx.db
      .query("studioPrompts")
      .withIndex("by_visibility_and_status_and_studioTool_and_createdAt", (q) =>
        q.eq("visibility", "public").eq("status", "active").eq("studioTool", args.studioTool),
      )
      .order(order)
      .paginate(args.paginationOpts);
  },
});

/** List the current user's private copies and authored prompts. */
export const listMyPrompts = query({
  args: {
    studioTool: v.optional(studioToolValidator),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { page: [], isDone: true, continueCursor: null };

    if (args.studioTool) {
      return await ctx.db
        .query("studioPrompts")
        .withIndex("by_user_and_studioTool", (q) => q.eq("userId", userId).eq("studioTool", args.studioTool!))
        .order("desc")
        .paginate(args.paginationOpts);
    }

    return await ctx.db
      .query("studioPrompts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

/** Get a single prompt (enforces visibility or ownership). */
export const getPrompt = query({
  args: { promptId: v.id("studioPrompts") },
  handler: async (ctx, args) => {
    const prompt = await ctx.db.get(args.promptId);
    if (!prompt) return null;

    const userId = await getAuthUserId(ctx);

    // Public active prompts are visible to everyone
    if (prompt.visibility === "public" && prompt.status === "active") return prompt;

    // Private/hidden prompts only visible to owner
    if (userId && prompt.userId === userId) return prompt;

    return null;
  },
});

/** Check whether the current user has already saved a given public prompt. */
export const hasSavedPrompt = query({
  args: { publicPromptId: v.id("studioPrompts") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;

    const existing = await ctx.db
      .query("studioPromptSaves")
      .withIndex("by_user_and_public_prompt", (q) => q.eq("userId", userId).eq("publicPromptId", args.publicPromptId))
      .unique();
    return existing !== null;
  },
});

/** Get the current user's rating for a public prompt (if any). */
export const getMyRating = query({
  args: { publicPromptId: v.id("studioPrompts") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const existing = await ctx.db
      .query("studioPromptRatings")
      .withIndex("by_user_and_public_prompt", (q) => q.eq("userId", userId).eq("publicPromptId", args.publicPromptId))
      .unique();
    return existing?.rating ?? null;
  },
});

// ── Mutations ──────────────────────────────────────────────────────────

/** Create a new private prompt. */
export const createPrompt = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    promptText: v.string(),
    studioTool: studioToolValidator,
    notebookId: v.optional(v.id("notebooks")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    if (!args.title.trim()) throw new Error("Title is required");
    if (args.title.length > PROMPT_TITLE_MAX_LENGTH)
      throw new Error(`Title must be ≤${PROMPT_TITLE_MAX_LENGTH} characters`);
    if (!args.promptText.trim()) throw new Error("Prompt text is required");
    if (args.promptText.length > PROMPT_TEXT_MAX_LENGTH)
      throw new Error(`Prompt text must be ≤${PROMPT_TEXT_MAX_LENGTH} characters`);
    if (args.description && args.description.length > PROMPT_DESCRIPTION_MAX_LENGTH)
      throw new Error(`Description must be ≤${PROMPT_DESCRIPTION_MAX_LENGTH} characters`);

    const now = Date.now();
    return await ctx.db.insert("studioPrompts", {
      userId,
      title: args.title.trim(),
      description: args.description?.trim(),
      promptText: args.promptText.trim(),
      studioTool: args.studioTool,
      visibility: "private",
      notebookId: args.notebookId,
      status: "active",
      saveCount: 0,
      ratingCount: 0,
      ratingSum: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Publish a private prompt to the public library. */
export const publishPrompt = mutation({
  args: { promptId: v.id("studioPrompts") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const prompt = await ctx.db.get(args.promptId);
    if (!prompt || prompt.userId !== userId) throw new Error("Not found or not owner");
    if (prompt.visibility === "public") throw new Error("Already public");
    if (prompt.status !== "active") throw new Error("Cannot publish a hidden/removed prompt");
    if (!prompt.promptText.trim()) throw new Error("Prompt text is required to publish");
    if (!prompt.title.trim()) throw new Error("Title is required to publish");

    const now = Date.now();
    await ctx.db.patch(args.promptId, {
      visibility: "public",
      publishedAt: now,
      updatedAt: now,
    });
  },
});

/** Retract a public prompt back to private. */
export const unpublishPrompt = mutation({
  args: { promptId: v.id("studioPrompts") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const prompt = await ctx.db.get(args.promptId);
    if (!prompt || prompt.userId !== userId) throw new Error("Not found or not owner");
    if (prompt.visibility !== "public") throw new Error("Not public");

    await ctx.db.patch(args.promptId, {
      visibility: "private",
      updatedAt: Date.now(),
    });
  },
});

/** Save a public prompt into the user's private library (copy-on-save). */
export const savePublicPrompt = mutation({
  args: {
    publicPromptId: v.id("studioPrompts"),
    notebookId: v.optional(v.id("notebooks")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const publicPrompt = await ctx.db.get(args.publicPromptId);
    if (!publicPrompt || publicPrompt.visibility !== "public" || publicPrompt.status !== "active")
      throw new Error("Public prompt not found");

    // Check for existing save to avoid double-counting
    const existingSave = await ctx.db
      .query("studioPromptSaves")
      .withIndex("by_user_and_public_prompt", (q) => q.eq("userId", userId).eq("publicPromptId", args.publicPromptId))
      .unique();

    if (existingSave) {
      // Already saved — return the existing private copy
      const existingCopy = await ctx.db
        .query("studioPrompts")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .order("desc")
        .first();
      // Find the copy with matching sourcePromptId
      const copies = await ctx.db
        .query("studioPrompts")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      const copy = copies.find((p) => p.sourcePromptId === args.publicPromptId);
      return copy?._id ?? null;
    }

    // Create the save record
    const now = Date.now();
    await ctx.db.insert("studioPromptSaves", {
      userId,
      publicPromptId: args.publicPromptId,
      savedAt: now,
    });

    // Increment save count on the public original
    const currentCount = publicPrompt.saveCount ?? 0;
    await ctx.db.patch(args.publicPromptId, {
      saveCount: currentCount + 1,
    });

    // Create a private editable copy
    return await ctx.db.insert("studioPrompts", {
      userId,
      title: publicPrompt.title,
      description: publicPrompt.description,
      promptText: publicPrompt.promptText,
      studioTool: publicPrompt.studioTool,
      visibility: "private",
      notebookId: args.notebookId,
      sourcePromptId: args.publicPromptId,
      status: "active",
      saveCount: 0,
      ratingCount: 0,
      ratingSum: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Upsert the current user's 1-5 rating for a public prompt. */
export const ratePrompt = mutation({
  args: {
    publicPromptId: v.id("studioPrompts"),
    rating: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    if (args.rating < 1 || args.rating > 5 || !Number.isInteger(args.rating))
      throw new Error("Rating must be an integer from 1 to 5");

    const prompt = await ctx.db.get(args.publicPromptId);
    if (!prompt || prompt.visibility !== "public" || prompt.status !== "active")
      throw new Error("Public prompt not found");

    const now = Date.now();
    const existing = await ctx.db
      .query("studioPromptRatings")
      .withIndex("by_user_and_public_prompt", (q) => q.eq("userId", userId).eq("publicPromptId", args.publicPromptId))
      .unique();

    let ratingSum = prompt.ratingSum ?? 0;
    let ratingCount = prompt.ratingCount ?? 0;

    if (existing) {
      // Adjust: subtract old, add new
      ratingSum = ratingSum - existing.rating + args.rating;
      await ctx.db.patch(existing._id, { rating: args.rating, updatedAt: now });
    } else {
      ratingSum += args.rating;
      ratingCount += 1;
      await ctx.db.insert("studioPromptRatings", {
        userId,
        publicPromptId: args.publicPromptId,
        rating: args.rating,
        createdAt: now,
        updatedAt: now,
      });
    }

    const ratingAverage = ratingCount > 0 ? ratingSum / ratingCount : 0;
    const bayesianRating = computeBayesianRating(ratingSum, ratingCount);

    await ctx.db.patch(args.publicPromptId, {
      ratingSum,
      ratingCount,
      ratingAverage,
      bayesianRating,
    });
  },
});

/** Update a prompt the user owns. */
export const updatePrompt = mutation({
  args: {
    promptId: v.id("studioPrompts"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    promptText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const prompt = await ctx.db.get(args.promptId);
    if (!prompt || prompt.userId !== userId) throw new Error("Not found or not owner");

    // Hidden/removed prompts cannot be edited back to active via update
    const updates: Record<string, unknown> = { updatedAt: Date.now() };

    if (args.title !== undefined) {
      if (!args.title.trim()) throw new Error("Title cannot be empty");
      if (args.title.length > PROMPT_TITLE_MAX_LENGTH)
        throw new Error(`Title must be ≤${PROMPT_TITLE_MAX_LENGTH} characters`);
      updates["title"] = args.title.trim();
    }
    if (args.description !== undefined) {
      if (args.description && args.description.length > PROMPT_DESCRIPTION_MAX_LENGTH)
        throw new Error(`Description must be ≤${PROMPT_DESCRIPTION_MAX_LENGTH} characters`);
      updates["description"] = args.description?.trim();
    }
    if (args.promptText !== undefined) {
      if (!args.promptText.trim()) throw new Error("Prompt text cannot be empty");
      if (args.promptText.length > PROMPT_TEXT_MAX_LENGTH)
        throw new Error(`Prompt text must be ≤${PROMPT_TEXT_MAX_LENGTH} characters`);
      updates["promptText"] = args.promptText.trim();
    }

    await ctx.db.patch(args.promptId, updates);
  },
});

/** Delete a prompt (soft-remove for public, hard delete for private). */
export const deletePrompt = mutation({
  args: { promptId: v.id("studioPrompts") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const prompt = await ctx.db.get(args.promptId);
    if (!prompt || prompt.userId !== userId) throw new Error("Not found or not owner");

    if (prompt.visibility === "public") {
      // Soft remove to preserve stats integrity
      await ctx.db.patch(args.promptId, { status: "removed", updatedAt: Date.now() });
    } else {
      // Hard delete for private prompts
      await ctx.db.delete(args.promptId);
    }
  },
});

/** Report a public prompt; auto-hides when threshold is reached. */
export const reportPrompt = mutation({
  args: {
    promptId: v.id("studioPrompts"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const prompt = await ctx.db.get(args.promptId);
    if (!prompt || prompt.visibility !== "public" || prompt.status !== "active")
      throw new Error("Public prompt not found");

    // Check for duplicate report from same user
    const existingReport = await ctx.db
      .query("studioPromptReports")
      .withIndex("by_prompt_and_reporter", (q) => q.eq("promptId", args.promptId).eq("reporterUserId", userId))
      .unique();
    if (existingReport) throw new Error("Already reported");

    const now = Date.now();
    await ctx.db.insert("studioPromptReports", {
      promptId: args.promptId,
      reporterUserId: userId,
      reason: args.reason,
      createdAt: now,
    });

    const newReportCount = (prompt.reportCount ?? 0) + 1;

    const patch: Record<string, unknown> = {
      reportCount: newReportCount,
      lastReportedAt: now,
    };

    // Auto-hide when threshold reached
    if (newReportCount >= PROMPT_REPORT_AUTO_HIDE_THRESHOLD) {
      patch["status"] = "hidden";
    }

    await ctx.db.patch(args.promptId, patch);
  },
});
