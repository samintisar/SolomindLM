import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

/** arXiv ToU: ≥3s between requests, one connection; we use 3.5s deployment-wide. */
export const ARXIV_MIN_INTERVAL_MS = 3500;

/**
 * Atomically acquire the global arXiv request slot.
 * Returns acquired=false when another action used the slot recently.
 */
export const tryAcquireArxivSlot = internalMutation({
  args: {},
  returns: v.object({
    acquired: v.boolean(),
    waitMs: v.number(),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const row = await ctx.db.query("arxivThrottle").first();
    if (row) {
      const elapsed = now - row.lastRequestAt;
      if (elapsed < ARXIV_MIN_INTERVAL_MS) {
        return { acquired: false, waitMs: ARXIV_MIN_INTERVAL_MS - elapsed };
      }
      await ctx.db.patch(row._id, { lastRequestAt: now });
      return { acquired: true, waitMs: 0 };
    }
    await ctx.db.insert("arxivThrottle", { lastRequestAt: now });
    return { acquired: true, waitMs: 0 };
  },
});
