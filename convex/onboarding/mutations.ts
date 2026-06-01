import { ConvexError, v } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import { mutation } from "../_generated/server";
import { getAuthUserId } from "../auth";
import { nextStepId } from "./constants";

const stepIdValidator = v.union(
  v.literal("createNotebook"),
  v.literal("addSource"),
  v.literal("askQuestion"),
  v.literal("generateArtifact")
);

/**
 * Authenticate and load the caller's onboarding row. Throws if no row exists —
 * callers are responsible for ensuring the row exists first
 * (`getOrCreateOnboardingRow`).
 */
async function loadRow(ctx: MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("Not authenticated");
  const row = await ctx.db
    .query("userOnboarding")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (!row) throw new ConvexError("Onboarding row not found");
  return row;
}

export const startTour = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const row = await loadRow(ctx);
    if (row.tourStatus !== "pending") return null;
    await ctx.db.patch(row._id, {
      tourStatus: "active",
      currentStepId: "createNotebook",
      startedAt: Date.now(),
    });
    return null;
  },
});

export const advanceTourStep = mutation({
  args: {
    expectedCurrentStepId: stepIdValidator,
    tourNotebookId: v.optional(v.id("notebooks")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await loadRow(ctx);
    if (row.tourStatus !== "active") return null;
    if (row.currentStepId !== args.expectedCurrentStepId) {
      throw new Error(
        `Step mismatch: expected ${args.expectedCurrentStepId}, got ${row.currentStepId ?? "undefined"}`
      );
    }
    const next = nextStepId(args.expectedCurrentStepId);
    const patch: Record<string, unknown> = {};
    if (next === null) {
      patch.currentStepId = undefined;
      patch.tourStatus = "completed";
      patch.completedAt = Date.now();
    } else {
      patch.currentStepId = next;
    }
    if (args.tourNotebookId !== undefined) {
      patch.tourNotebookId = args.tourNotebookId;
    }
    await ctx.db.patch(row._id, patch);
    return null;
  },
});

export const skipTour = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const row = await loadRow(ctx);
    await ctx.db.patch(row._id, {
      tourStatus: "skipped",
      currentStepId: undefined,
    });
    return null;
  },
});

export const completeTour = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const row = await loadRow(ctx);
    await ctx.db.patch(row._id, {
      tourStatus: "completed",
      currentStepId: undefined,
      completedAt: Date.now(),
    });
    return null;
  },
});

export const dismissChecklist = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const row = await loadRow(ctx);
    await ctx.db.patch(row._id, { checklistDismissed: true });
    return null;
  },
});

export const restartTour = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const row = await loadRow(ctx);
    await ctx.db.patch(row._id, {
      tourStatus: "active",
      currentStepId: "createNotebook",
      startedAt: Date.now(),
      tourNotebookId: undefined,
      completedAt: undefined,
      checklistDismissed: false,
    });
    return null;
  },
});

export const showChecklist = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const row = await loadRow(ctx);
    await ctx.db.patch(row._id, { checklistDismissed: false });
    return null;
  },
});
