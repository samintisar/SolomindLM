/**
 * Migration: Remove studioPrompts with studioTool: "slides"
 *
 * The "slides" feature was replaced by "infographic". Any saved prompts that
 * targeted the slides tool are remapped to "infographic" so they remain usable.
 *
 * Run once per environment before removing "slides" from the schema union:
 *
 *   npx convex run _migration/removeSlidePrompts:migrateSlidePrompts
 *
 * After this migration completes, remove v.literal("slides") from schema.ts
 * and redeploy.
 */

import { internalMutation, internalQuery } from "../_generated/server";

export const countSlidePrompts = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("studioPrompts")
      .withIndex("by_user_and_studioTool")
      .filter((q) => q.eq(q.field("studioTool"), "slides"))
      .collect();
    return { count: rows.length };
  },
});

export const migrateSlidePrompts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("studioPrompts")
      .withIndex("by_user_and_studioTool")
      .filter((q) => q.eq(q.field("studioTool"), "slides"))
      .collect();

    let updated = 0;
    for (const row of rows) {
      await ctx.db.patch(row._id, {
        studioTool: "infographic" as any,
        updatedAt: Date.now(),
      });
      updated++;
    }

    return { updated };
  },
});
