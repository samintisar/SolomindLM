import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { type MutationCtx, mutation, query } from "../_generated/server";
import { assertFeedbackAdmin, isFeedbackAdminEmail } from "../_lib/feedbackAdmin";
import { rateLimiter } from "../_lib/rateLimits";
import { toAdminFeedbackRow } from "../_model/feedback";
import { getAuthUserId } from "../auth";

const MAX_TEXT = 5000;

type FeedbackStatus = "received" | "planned" | "shipped" | "closed";

const submitArgs = {
  type: v.union(v.literal("bug"), v.literal("feature")),
  body: v.string(),
  detail: v.optional(v.string()),
  screenshotId: v.optional(v.id("_storage")),
  route: v.string(),
  surface: v.union(v.literal("web"), v.literal("mobile")),
  appVersion: v.string(),
  lastRequestId: v.optional(v.string()),
};

async function derivePlanTier(ctx: MutationCtx, userId: Id<"users">): Promise<"free" | "pro"> {
  const sub = await ctx.db
    .query("stripeSubscriptions")
    .withIndex("by_user_and_status", (q) => q.eq("userId", userId).eq("status", "active"))
    .first();
  return sub ? "pro" : "free";
}

/** Upload target for an optional screenshot. Auth-gated. */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    return await ctx.storage.generateUploadUrl();
  },
});

export const submit = mutation({
  args: submitArgs,
  returns: v.object({ id: v.id("feedback") }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const body = args.body.trim();
    if (!body) throw new Error("Enter a description first");
    if (body.length > MAX_TEXT) throw new Error("Description is too long");
    const detail = args.detail?.trim() || undefined;
    if (detail && detail.length > MAX_TEXT) throw new Error("Detail is too long");

    await rateLimiter.limit(ctx, "feedbackSubmit", { key: userId, throws: true });

    const now = Date.now();
    const id = await ctx.db.insert("feedback", {
      userId,
      type: args.type,
      body,
      detail,
      screenshotId: args.screenshotId,
      route: args.route.slice(0, 512),
      surface: args.surface,
      appVersion: args.appVersion.slice(0, 64),
      lastRequestId: args.lastRequestId?.slice(0, 128),
      planTier: await derivePlanTier(ctx, userId),
      status: "received",
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  },
});

export const isAdmin = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;
    const user = await ctx.db.get(userId);
    return isFeedbackAdminEmail(user?.email ?? undefined);
  },
});

export const listAll = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    await assertFeedbackAdmin(ctx, userId);

    const status = args.status as FeedbackStatus | undefined;
    const rows = status
      ? await ctx.db
          .query("feedback")
          .withIndex("by_status", (q) => q.eq("status", status))
          .order("desc")
          .take(200)
      : await ctx.db.query("feedback").order("desc").take(200);
    return rows.map(toAdminFeedbackRow);
  },
});

/** Signed URL for a submission's screenshot. Admin-only. */
export const getScreenshotUrl = query({
  args: { feedbackId: v.id("feedback") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    await assertFeedbackAdmin(ctx, userId);
    const row = await ctx.db.get(args.feedbackId);
    if (!row?.screenshotId) return null;
    return await ctx.storage.getUrl(row.screenshotId);
  },
});
