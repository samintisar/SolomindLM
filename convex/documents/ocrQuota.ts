import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { isProUser } from "../_lib/limits";
import { ocrMonthKey, ocrPageLimitsFor, ocrPagesToGrant } from "../_lib/ocrPageLimits";
import { internalMutation } from "../functions";

async function usageRow(ctx: MutationCtx, userId: Id<"users">, month: string) {
  return ctx.db
    .query("ocrUsage")
    .withIndex("by_user_and_month", (q) => q.eq("userId", userId).eq("month", month))
    .unique();
}

/**
 * Reserves the pages one OCR call may read: the plan's per-file cap, or what is left of the month.
 * A mutation, so parallel uploads can't both spend the same pages. `granted: 0` means the month
 * is used up. Hand back what the call didn't read with `releaseOcrPages`.
 */
export const reserveOcrPages = internalMutation({
  args: { userId: v.id("users") },
  returns: v.object({
    granted: v.number(),
    month: v.string(),
    isPro: v.boolean(),
    limits: v.object({ perFile: v.number(), perMonth: v.number() }),
  }),
  handler: async (ctx, { userId }) => {
    const isPro = await isProUser(ctx, userId);
    const limits = ocrPageLimitsFor(isPro);
    const month = ocrMonthKey(Date.now());
    const row = await usageRow(ctx, userId, month);
    const granted = ocrPagesToGrant(limits, row?.pages ?? 0);
    if (granted > 0) {
      if (row) await ctx.db.patch("ocrUsage", row._id, { pages: row.pages + granted });
      else await ctx.db.insert("ocrUsage", { userId, month, pages: granted });
    }
    return {
      granted,
      month,
      isPro,
      limits: { perFile: limits.perFile, perMonth: limits.perMonth },
    };
  },
});

/** Hands back reserved pages an OCR call did not read (a shorter file, or a call Mistral didn't bill). */
export const releaseOcrPages = internalMutation({
  args: { userId: v.id("users"), month: v.string(), pages: v.number() },
  returns: v.null(),
  handler: async (ctx, { userId, month, pages }) => {
    if (pages <= 0) return null;
    const row = await usageRow(ctx, userId, month);
    if (row) await ctx.db.patch("ocrUsage", row._id, { pages: Math.max(0, row.pages - pages) });
    return null;
  },
});
