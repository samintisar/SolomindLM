import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, internalQuery } from "../_generated/server";
import { PURGE_BATCH_SIZE, PURGE_STEPS } from "./_purge";

/**
 * Convex Auth access tokens live for an hour and keep working after their session is
 * deleted, so a client holding one could still write rows after the first purge pass.
 * A second full pass once they have all expired removes anything written that way.
 */
const STALE_TOKEN_SWEEP_DELAY_MS = 65 * 60 * 1000;

/** Stripe statuses that still bill (or can resume billing) and must be cancelled first. */
const SETTLED_SUBSCRIPTION_STATUSES = new Set(["canceled", "incomplete_expired"]);

/**
 * Stripe subscription ids the user could still be charged for. Account deletion cancels
 * each one before touching any data, so a failed cancellation leaves the account intact.
 */
export const listBillableSubscriptionIds = internalQuery({
  args: { userId: v.id("users") },
  returns: v.array(v.string()),
  handler: async (ctx, { userId }) => {
    const subscriptions = await ctx.db
      .query("stripeSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(20);
    return subscriptions
      .filter((s) => !SETTLED_SUBSCRIPTION_STATUSES.has(s.status))
      .map((s) => s.stripeSubscriptionId);
  },
});

/**
 * Deletes the user row and every sign-in record in one transaction, which signs the
 * user out on every device and frees their email for a new account, then schedules the
 * batched purge of everything they own, plus a second pass once any access token issued
 * before deletion has expired. Safe to call again for a deleted user.
 */
export const deleteUserIdentity = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return null;

    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .take(50);
    for (const account of accounts) {
      const codes = await ctx.db
        .query("authVerificationCodes")
        .withIndex("accountId", (q) => q.eq("accountId", account._id))
        .take(50);
      for (const code of codes) await ctx.db.delete(code._id);
      await ctx.db.delete(account._id);
    }

    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .take(500);
    for (const session of sessions) {
      const tokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
        .take(500);
      for (const token of tokens) await ctx.db.delete(token._id);
      await ctx.db.delete(session._id);
    }

    if (user.email) {
      const limits = await ctx.db
        .query("authRateLimits")
        .withIndex("identifier", (q) => q.eq("identifier", user.email!))
        .take(10);
      for (const limit of limits) await ctx.db.delete(limit._id);
    }

    await ctx.db.delete(userId);
    await ctx.scheduler.runAfter(0, internal.account.deletion.purgeUserData, { userId, step: 0 });
    await ctx.scheduler.runAfter(
      STALE_TOKEN_SWEEP_DELAY_MS,
      internal.account.deletion.purgeUserData,
      { userId, step: 0 }
    );
    console.log(`[accountDeletion] identity deleted; purge scheduled for ${userId}`);
    return null;
  },
});

/**
 * Deletes up to `PURGE_BATCH_SIZE` rows of the user's data, resuming at `step`, and
 * reschedules itself until every purge step reports nothing left.
 */
export const purgeUserData = internalMutation({
  args: { userId: v.id("users"), step: v.number() },
  returns: v.null(),
  handler: async (ctx, { userId, step }) => {
    const budget = { remaining: PURGE_BATCH_SIZE };
    for (let i = step; i < PURGE_STEPS.length; i++) {
      const done = await PURGE_STEPS[i].run(ctx, userId, budget);
      if (!done) {
        await ctx.scheduler.runAfter(0, internal.account.deletion.purgeUserData, {
          userId,
          step: i,
        });
        return null;
      }
    }
    console.log(`[accountDeletion] purge complete for ${userId}`);
    return null;
  },
});
