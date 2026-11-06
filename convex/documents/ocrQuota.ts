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
    const bonusPages = row?.bonusPages ?? 0;
    const granted = ocrPagesToGrant(limits, row?.pages ?? 0, bonusPages);
    if (granted > 0) {
      if (row) await ctx.db.patch("ocrUsage", row._id, { pages: row.pages + granted });
      else await ctx.db.insert("ocrUsage", { userId, month, pages: granted });
    }
    return {
      granted,
      month,
      isPro,
      // The month's allowance as the user has it, bonus included, so messages quote the real number.
      limits: { perFile: limits.perFile, perMonth: limits.perMonth + bonusPages },
    };
  },
});

/**
 * Staff tool: sets the users with these emails' extra OCR pages for `month` ("2026-11", this month
 * or later), e.g. to re-upload files an outage failed. The bonus is set, not added, so running it
 * twice gives the same result and `pages: 0` takes a bonus back. `granted` counts accounts (an
 * email can have more than one). Run with `npx convex run documents/ocrQuota:grantOcrBonus`.
 */
export const grantOcrBonus = internalMutation({
  args: { emails: v.array(v.string()), month: v.string(), pages: v.number() },
  returns: v.object({ granted: v.number(), missing: v.array(v.string()) }),
  handler: async (ctx, { emails, month, pages }) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new Error(`month must look like "2026-11", got ${month}`);
    }
    const thisMonth = ocrMonthKey(Date.now());
    if (month < thisMonth) {
      throw new Error(`month ${month} is already over (this month is ${thisMonth})`);
    }
    if (!Number.isInteger(pages) || pages < 0) throw new Error("pages must be a whole number ≥ 0");
    let granted = 0;
    const missing: string[] = [];
    for (const email of emails) {
      // The index is case-sensitive: try the address as given and in lower case, and grant every
      // account found under either.
      const variants = [...new Set([email.trim(), email.trim().toLowerCase()])];
      const users = new Map<Id<"users">, true>();
      for (const variant of variants) {
        const found = await ctx.db
          .query("users")
          .withIndex("email", (q) => q.eq("email", variant))
          .take(10);
        for (const user of found) users.set(user._id, true);
      }
      if (users.size === 0) {
        missing.push(email);
        continue;
      }
      for (const userId of users.keys()) {
        const row = await usageRow(ctx, userId, month);
        if (row) await ctx.db.patch("ocrUsage", row._id, { bonusPages: pages });
        else await ctx.db.insert("ocrUsage", { userId, month, pages: 0, bonusPages: pages });
        granted++;
      }
    }
    return { granted, missing };
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
