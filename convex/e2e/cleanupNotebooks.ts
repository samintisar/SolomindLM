import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation } from "../_generated/server";

/**
 * Delete all notebooks with titles starting with "e2e-" for a given user email.
 * Used by E2E test global setup to clean up stale test notebooks.
 */
export const deleteE2eNotebooksByEmail = mutation({
  args: {
    email: v.string(),
  },
  returns: v.object({
    deleted: v.number(),
  }),
  handler: async (ctx, { email }) => {
    // Find user by email
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();

    if (!user) {
      return { deleted: 0 };
    }

    // Find all notebooks for this user with e2e- prefix
    const notebooks = await ctx.db
      .query("notebooks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const e2eNotebooks = notebooks.filter((n) => n.title.startsWith("e2e-"));
    let deleted = 0;

    for (const notebook of e2eNotebooks) {
      // Delete associated documents first
      const documents = await ctx.db
        .query("documents")
        .withIndex("by_notebook", (q) => q.eq("notebookId", notebook._id))
        .collect();

      for (const doc of documents) {
        await ctx.db.delete(doc._id);
      }

      // Delete the notebook
      await ctx.db.delete(notebook._id);
      deleted++;
    }

    return { deleted };
  },
});
