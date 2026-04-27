import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import * as Notebooks from "../_model/notebooks";

/**
 * One-off / CLI: delete owned notebooks whose title starts with `titlePrefix` (default `e2e-`).
 * Same related-row cleanup as public `notebooks.remove` (members + share links + notebook).
 * Includes notebooks inside folders (UI-only cleanup on /home cannot see those).
 *
 * Run (dev, from repo root):
 *   bunx convex run --push e2e/cleanupNotebooks:deleteE2eNotebooksByEmail '{"email":"you@example.com"}'
 * Optional: `titlePrefix`, or `userId` instead of `email`. In code: `internal.e2e.cleanupNotebooks.*`.
 */
export const deleteE2eNotebooksByEmail = internalMutation({
  args: {
    email: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    titlePrefix: v.optional(v.string()),
  },
  returns: v.object({
    deleted: v.number(),
    titles: v.array(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const titlePrefix = args.titlePrefix ?? "e2e-";

    let userId: Id<"users"> | null = args.userId ?? null;
    if (!userId) {
      const email = args.email?.trim();
      if (!email) {
        return { deleted: 0, titles: [], error: "Provide `email` or `userId`" };
      }
      const user = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("email"), email))
        .first();
      if (!user) {
        return { deleted: 0, titles: [], error: `No user with email: ${email}` };
      }
      userId = user._id;
    }

    const all = await Notebooks.getUserNotebooks(ctx, userId);
    const toDelete = all.filter((n) => n.title.startsWith(titlePrefix));
    const titles: string[] = [];
    for (const n of toDelete) {
      await Notebooks.removeNotebookWithRelated(ctx, n._id);
      titles.push(n.title);
    }
    return { deleted: toDelete.length, titles, error: undefined };
  },
});
