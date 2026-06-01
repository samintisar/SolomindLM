import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/**
 * Database operations for documents.
 * No query/mutation/action exports — used by convex/documents.ts and jobs.
 */

export async function listByNotebook(
  ctx: QueryCtx,
  notebookId: Id<"notebooks">
): Promise<Doc<"documents">[]> {
  return await ctx.db
    .query("documents")
    .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
    .order("desc")
    .collect();
}
