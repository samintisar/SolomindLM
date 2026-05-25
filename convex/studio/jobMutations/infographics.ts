import { internalMutation } from "../../_generated/server";
import { v } from "convex/values";
import { buildErrorMetadata } from "./jobErrorUtils";

export const saveInfographicResults = internalMutation({
  args: {
    infographicId: v.id("infographics"),
    data: v.any(),
    metadata: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.infographicId, {
      data: args.data,
      status: "completed",
      updatedAt: Date.now(),
      title: args.metadata?.title ?? "Infographic",
      metadata: {
        ...args.metadata,
        completedAt: Date.now(),
      },
    });
  },
});

export const updateInfographicTitle = internalMutation({
  args: {
    infographicId: v.id("infographics"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.infographicId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
