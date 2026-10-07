// convex/freeTools/rateLimit.ts
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { rateLimiter } from "../_lib/rateLimits";

const checkResult = v.union(
  v.object({ ok: v.literal(true) }),
  v.object({
    ok: v.literal(false),
    scope: v.union(v.literal("ip"), v.literal("global")),
    retryAfterMs: v.number(),
  })
);

/** Check (without consuming) the per-IP window, then the global window. */
export const checkFreeFlashcardLimits = internalMutation({
  args: { ipKey: v.string() },
  returns: checkResult,
  handler: async (ctx, { ipKey }) => {
    const ip = await rateLimiter.check(ctx, "freeToolFlashcardsIp", { key: ipKey });
    if (!ip.ok) return { ok: false as const, scope: "ip" as const, retryAfterMs: ip.retryAfter };
    const global = await rateLimiter.check(ctx, "freeToolFlashcardsGlobal");
    if (!global.ok) {
      return { ok: false as const, scope: "global" as const, retryAfterMs: global.retryAfter };
    }
    return { ok: true as const };
  },
});

/** Consume one run from both windows. Called only after cards were generated. */
export const consumeFreeFlashcardLimits = internalMutation({
  args: { ipKey: v.string() },
  returns: v.null(),
  handler: async (ctx, { ipKey }) => {
    const ip = await rateLimiter.limit(ctx, "freeToolFlashcardsIp", { key: ipKey });
    const global = await rateLimiter.limit(ctx, "freeToolFlashcardsGlobal");
    if (!ip.ok || !global.ok) {
      // A concurrent request took the last slot between check and consume; the work is done.
      console.warn("[FreeTools] limit consumed past the window", { ip: ip.ok, global: global.ok });
    }
    return null;
  },
});
