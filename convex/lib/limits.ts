import { getAuthUserId } from "../auth";
import { MutationCtx } from "../_generated/server";

/**
 * Check if user has reached their notebook limit
 * @throws Error if limit is reached
 */
export async function checkNotebookLimit(ctx: MutationCtx): Promise<void> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Unauthenticated");

  // Check if user has an active subscription
  const subscription = await ctx.db
    .query("stripeSubscriptions")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .filter((q: any) => q.eq(q.field("status"), "active"))
    .first();

  const limit = subscription ? 100 : 5;

  // Count existing notebooks
  const notebooks = await ctx.db
    .query("notebooks")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();

  if (notebooks.length >= limit) {
    throw new Error(`Notebook limit reached (${limit}). Please upgrade to create more notebooks.`);
  }
}

/**
 * Check if user has reached their source (document) limit
 * @throws Error if limit is reached
 */
export async function checkSourceLimit(ctx: MutationCtx, notebookId: string): Promise<void> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Unauthenticated");

  // Check if user has an active subscription
  const subscription = await ctx.db
    .query("stripeSubscriptions")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .filter((q: any) => q.eq(q.field("status"), "active"))
    .first();

  const limit = subscription ? 500 : 20;

  // Count existing documents for this notebook
  const documents = await ctx.db
    .query("documents")
    .withIndex("by_notebook", (q: any) => q.eq("notebookId", notebookId))
    .collect();

  if (documents.length >= limit) {
    throw new Error(`Source limit reached (${limit}). Please upgrade to add more sources.`);
  }
}
