import { internalMutation } from "../../_generated/server";
import { v } from "convex/values";
import { assertCanEditNotebook } from "../../_lib/notebookAccess";

/**
 * Internal mutation: create a literature report.
 * Used by the literature review agent to persist the generated report.
 */
export const createLiteratureReport = internalMutation({
  args: {
    title: v.string(),
    notebookId: v.id("notebooks"),
    userId: v.id("users"),
    content: v.string(),
    citationStyle: v.string(),
    sections: v.array(v.object({
      heading: v.string(),
      content: v.string(),
    })),
    citationIds: v.array(v.id("citations")),
    tableId: v.optional(v.id("literatureTables")),
  },
  handler: async (ctx, args) => {
    await assertCanEditNotebook(ctx, args.notebookId, args.userId);

    return await ctx.db.insert("literatureReports", {
      ...args,
      status: "completed",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
