import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

const providerValidator = v.union(v.literal("semantic_scholar"), v.literal("arxiv"));

export type FragileAcademicProvider = "semantic_scholar" | "arxiv";

export const SEMANTIC_SCHOLAR_UNAUTHENTICATED_COOLDOWN_MS = 15 * 60 * 1000;
/** After repeated 429s; prefer Retry-After when API sends it. */
export const SEMANTIC_SCHOLAR_AUTHENTICATED_COOLDOWN_MS = 2 * 60 * 1000;
/** Max 429 retries before recording deployment cooldown (honor Retry-After between attempts). */
export const SEMANTIC_SCHOLAR_MAX_429_RETRIES = 3;
export const ARXIV_RATE_LIMIT_COOLDOWN_MS = 15 * 60 * 1000;

export const checkProviderCooldown = internalMutation({
  args: { provider: providerValidator },
  returns: v.object({
    coolingDown: v.boolean(),
    retryAfterMs: v.number(),
    cooldownUntil: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("externalProviderCooldowns")
      .withIndex("by_provider", (q) => q.eq("provider", args.provider))
      .first();
    if (!row) {
      return { coolingDown: false, retryAfterMs: 0 };
    }

    const now = Date.now();
    const retryAfterMs = row.cooldownUntil - now;
    if (retryAfterMs <= 0) {
      return { coolingDown: false, retryAfterMs: 0 };
    }

    return {
      coolingDown: true,
      retryAfterMs,
      cooldownUntil: row.cooldownUntil,
    };
  },
});

export const recordProviderCooldown = internalMutation({
  args: {
    provider: providerValidator,
    cooldownMs: v.number(),
    status: v.optional(v.number()),
    reason: v.optional(v.string()),
  },
  returns: v.object({ cooldownUntil: v.number() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const cooldownUntil = now + Math.max(0, args.cooldownMs);
    const existing = await ctx.db
      .query("externalProviderCooldowns")
      .withIndex("by_provider", (q) => q.eq("provider", args.provider))
      .first();

    const patch = {
      cooldownUntil,
      lastStatus: args.status,
      reason: args.reason,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("externalProviderCooldowns", {
        provider: args.provider,
        ...patch,
      });
    }

    return { cooldownUntil };
  },
});
