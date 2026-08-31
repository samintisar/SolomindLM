import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getAuthUserId } from "../auth";
import { emitUserCreatedIfNeeded } from "../email/milestones";

const onboardingRowValidator = v.object({
  _id: v.id("userOnboarding"),
  _creationTime: v.number(),
  userId: v.id("users"),
  tourStatus: v.union(
    v.literal("pending"),
    v.literal("active"),
    v.literal("skipped"),
    v.literal("completed")
  ),
  currentStepId: v.optional(
    v.union(
      v.literal("createNotebook"),
      v.literal("addSource"),
      v.literal("askQuestion"),
      v.literal("generateArtifact")
    )
  ),
  tourNotebookId: v.optional(v.id("notebooks")),
  checklistDismissed: v.boolean(),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  emittedUserCreated: v.optional(v.boolean()),
  emittedNotebookCreated: v.optional(v.boolean()),
  emittedSourceAdded: v.optional(v.boolean()),
  emittedArtifactGenerated: v.optional(v.boolean()),
  emittedOnboardingCompleted: v.optional(v.boolean()),
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

    return { tourStatus: "pending" as const, checklistDismissed: false };
  },
});

export const getOrCreateOnboardingRow = mutation({
  args: {},
  returns: v.id("userOnboarding"),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Not authenticated");

    const existing = await ctx.db
      .query("userOnboarding")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existing) return existing._id;

    const user = await ctx.db.get(userId);
    if (!user) throw new ConvexError("User not found");

    const email = user.email ?? null;
    const rowId = await ctx.db.insert("userOnboarding", {
      userId,
      tourStatus: "pending",
      checklistDismissed: false,
      emittedUserCreated: email ? true : undefined,
    });
    if (email) {
      await emitUserCreatedIfNeeded(ctx, userId);
    }
    return rowId;
  },
});
