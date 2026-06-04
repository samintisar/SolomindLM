import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { env } from "./env.js";

/**
 * Semantic Scholar introductory API-key limit is 1 request/second per key.
 * @see https://api.semanticscholar.org/product/api (tutorial: use a key; slow down on 429)
 */
export const SEMANTIC_SCHOLAR_AUTHENTICATED_INTERVAL_MS = 1000;

/** Unauthenticated traffic shares a global pool — stay conservative. */
export const SEMANTIC_SCHOLAR_UNAUTHENTICATED_INTERVAL_MS = 2000;

export function semanticScholarMinIntervalMs(): number {
  return env.SEMANTIC_SCHOLAR_API_KEY
    ? SEMANTIC_SCHOLAR_AUTHENTICATED_INTERVAL_MS
    : SEMANTIC_SCHOLAR_UNAUTHENTICATED_INTERVAL_MS;
}

export function isSemanticScholarAuthenticated(): boolean {
  return Boolean(env.SEMANTIC_SCHOLAR_API_KEY);
}

/**
 * Atomically acquire the deployment-wide Semantic Scholar request slot (1 RPS with key).
 */
export const tryAcquireSemanticScholarSlot = internalMutation({
  args: {},
  returns: v.object({
    acquired: v.boolean(),
    waitMs: v.number(),
    minIntervalMs: v.number(),
  }),
  handler: async (ctx) => {
    const minIntervalMs = semanticScholarMinIntervalMs();
    const now = Date.now();
    const row = await ctx.db.query("semanticScholarThrottle").first();
    if (row) {
      const elapsed = now - row.lastRequestAt;
      if (elapsed < minIntervalMs) {
        return { acquired: false, waitMs: minIntervalMs - elapsed, minIntervalMs };
      }
      await ctx.db.patch(row._id, { lastRequestAt: now });
      return { acquired: true, waitMs: 0, minIntervalMs };
    }
    await ctx.db.insert("semanticScholarThrottle", { lastRequestAt: now });
    return { acquired: true, waitMs: 0, minIntervalMs };
  },
});
