import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getAuthUserId } from "../auth";
import { FRESH_USER_WINDOW_MS } from "./constants";

const onboardingRowValidator = v.object({
  _id: v.id("userOnboarding"),
  _creationTime: v.number(),
  userId: v.id("users"),
  tourStatus: v.union(
    v.literal("pending"),
    v.literal("active"),
    v.literal("skipped"),
    v.literal("completed"),
  ),
  currentStepId: v.optional(
    v.union(
      v.literal("createNotebook"),
      v.literal("addSource"),
      v.literal("askQuestion"),
      v.literal("openStudio"),
      v.literal("generateArtifact"),
    ),
  ),
  tourNotebookId: v.optional(v.id("notebooks")),
  checklistDismissed: v.boolean(),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
});

const defaultStateValidator = v.object({
  tourStatus: v.union(v.literal("pending"), v.literal("completed")),
  checklistDismissed: v.boolean(),
});

export const getOnboardingState = query({
  args: {},
  returns: v.union(v.null(), onboardingRowValidator, defaultStateValidator),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const row = await ctx.db
      .query("userOnboarding")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (row) return row;

    const user = await ctx.db.get(userId);
    if (!user) return null;

    const isFresh = Date.now() - user._creationTime < FRESH_USER_WINDOW_MS;
    return isFresh
      ? { tourStatus: "pending" as const, checklistDismissed: false }
      : { tourStatus: "completed" as const, checklistDismissed: true };
  },
});

export const getOrCreateOnboardingRow = mutation({
  args: {},
  returns: v.id("userOnboarding"),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("userOnboarding")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existing) return existing._id;

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    const isFresh = Date.now() - user._creationTime < FRESH_USER_WINDOW_MS;
    return await ctx.db.insert("userOnboarding", {
      userId,
      tourStatus: isFresh ? "pending" : "completed",
      checklistDismissed: !isFresh,
    });
  },
});
