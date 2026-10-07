// convex/freeTools/rateLimit.ts
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { createServiceLogger } from "../_lib/logging/serviceLogger";
import { rateLimiter } from "../_lib/rateLimits";

const reserveResult = v.union(
  v.object({ ok: v.literal(true) }),
  v.object({
    ok: v.literal(false),
    scope: v.union(v.literal("ip"), v.literal("global")),
    retryAfterMs: v.number(),
  })
);

/**
 * Admit one LLM call, in a single transaction:
 * 1. check (without consuming) the success windows — per IP, then global;
 * 2. consume one attempt from the per-IP, then the global attempts window (the global one is
 *    checked first so a closed tool does not burn IP attempts).
 * Attempts count every call, failures included, so they bound spend even when generations fail
 * or requests race; successes are consumed separately after cards were generated.
 */
export const reserveFreeFlashcardRun = internalMutation({
  args: { ipKey: v.string() },
  returns: reserveResult,
  handler: async (ctx, { ipKey }) => {
    const ip = await rateLimiter.check(ctx, "freeToolFlashcardsIp", { key: ipKey });
    if (!ip.ok) return { ok: false as const, scope: "ip" as const, retryAfterMs: ip.retryAfter };
    const global = await rateLimiter.check(ctx, "freeToolFlashcardsGlobal");
    if (!global.ok) {
      return { ok: false as const, scope: "global" as const, retryAfterMs: global.retryAfter };
    }

    // Peek at the global attempts first so a refusal there does not burn the caller's IP attempt.
    const globalOpen = await rateLimiter.check(ctx, "freeToolFlashcardsGlobalAttempts");
    if (!globalOpen.ok) {
      return { ok: false as const, scope: "global" as const, retryAfterMs: globalOpen.retryAfter };
    }
    const ipAttempt = await rateLimiter.limit(ctx, "freeToolFlashcardsIpAttempts", { key: ipKey });
    if (!ipAttempt.ok) {
      return { ok: false as const, scope: "ip" as const, retryAfterMs: ipAttempt.retryAfter };
    }
    // Same transaction as the check above, so this cannot be refused; handled for completeness.
    const globalAttempt = await rateLimiter.limit(ctx, "freeToolFlashcardsGlobalAttempts");
    if (!globalAttempt.ok) {
      return {
        ok: false as const,
        scope: "global" as const,
        retryAfterMs: globalAttempt.retryAfter,
      };
    }
    return { ok: true as const };
  },
});

/** Consume one run from both success windows. Called only after cards were generated. */
export const consumeFreeFlashcardLimits = internalMutation({
  args: { ipKey: v.string() },
  returns: v.null(),
  handler: async (ctx, { ipKey }) => {
    const ip = await rateLimiter.limit(ctx, "freeToolFlashcardsIp", { key: ipKey });
    const global = await rateLimiter.limit(ctx, "freeToolFlashcardsGlobal");
    if (!ip.ok || !global.ok) {
      // A concurrent request took the last slot between reserve and consume; the work is done.
      createServiceLogger("free_tools", "consume_limits").warn("limit_consumed_past_window", {
        ip: ip.ok,
        global: global.ok,
      });
    }
    return null;
  },
});
