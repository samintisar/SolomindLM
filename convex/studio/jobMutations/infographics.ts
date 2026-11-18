import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { scheduleStudioJobCompletionPush } from "../../push/notify";
import { buildErrorMetadata } from "./jobErrorUtils";

export const updateInfographicStatus = internalMutation({
  args: {
    infographicId: v.id("infographics"),
    status: v.union(
      v.literal("draft"),
      v.literal("generating"),
      v.literal("completed"),
      v.literal("failed")
    ),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const updates: any = {
      status: args.status,
      updatedAt: Date.now(),
    };
    if (args.metadata) {
      updates.metadata = args.metadata;
    }
    await ctx.db.patch(args.infographicId, updates);
  },
});

export const markInfographicFailed = internalMutation({
  args: {
    infographicId: v.id("infographics"),
    error: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const errorMetadata = buildErrorMetadata(
      args.error,
      args.metadata?.phase || "unknown",
      args.metadata
    );
    await ctx.db.patch(args.infographicId, {
      status: "failed",
      updatedAt: Date.now(),
      metadata: {
        ...args.metadata,
        ...errorMetadata,
      },
    });
  },
});
