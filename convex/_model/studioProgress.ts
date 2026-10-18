/**
 * A public notebook viewer's own practice progress (`studioProgress`). Owners and editors keep
 * practising on the shared studio row; a viewer's reviews, answers, drafts, grades and position
 * are stored here, one row per (viewer, item), and laid over the stripped shared row on read.
 * Progress shapes and the overlay itself are pure helpers in `practiceProgress.ts`.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { assertCanReadNotebook } from "../_lib/notebookAccess";
import { forViewer, type PracticeItemType, practiceItemType } from "./practiceProgress";

type ProgressKey = {
  userId: Id<"users">;
  itemType: PracticeItemType;
  itemId: string;
  notebookId: Id<"notebooks">;
};

/** A notebook's or a studio item's progress rows, for clean-up. */
export type ProgressScope = { notebookId: Id<"notebooks"> } | { itemId: string };

/**
 * Where a practice write goes: the shared row for the owner and editors, the caller's own
 * progress for a public notebook's viewer. Throws "Notebook not found" for anyone else.
 */
export async function getPracticeTarget(
  ctx: QueryCtx,
  notebookId: Id<"notebooks">,
  userId: Id<"users">
): Promise<"shared" | "viewer"> {
  const { access } = await assertCanReadNotebook(ctx, notebookId, userId);
  return access === "viewer" ? "viewer" : "shared";
}

export async function getViewerProgress(
  ctx: QueryCtx,
  userId: Id<"users">,
  itemId: string
): Promise<Doc<"studioProgress"> | null> {
  return await ctx.db
    .query("studioProgress")
    .withIndex("by_user_and_item", (q) => q.eq("userId", userId).eq("itemId", itemId))
    .unique();
}

/** Creates or updates the viewer's progress on one item with `update(current progress)`. */
export async function saveViewerProgress(
  ctx: MutationCtx,
  key: ProgressKey,
  update: (current: unknown) => unknown
): Promise<void> {
  const existing = await getViewerProgress(ctx, key.userId, key.itemId);
  const progress = update(existing?.progress);
  const updatedAt = Date.now();
  if (existing) {
    await ctx.db.patch("studioProgress", existing._id, { progress, updatedAt });
  } else {
    await ctx.db.insert("studioProgress", { ...key, progress, updatedAt });
  }
}

/** The viewer's progress on every item of a notebook they've practised, by item id. */
export async function listViewerProgressByItem(
  ctx: QueryCtx,
  userId: Id<"users">,
  notebookId: Id<"notebooks">
): Promise<Map<string, unknown>> {
  const rows = await ctx.db
    .query("studioProgress")
    .withIndex("by_user_and_notebook", (q) => q.eq("userId", userId).eq("notebookId", notebookId))
    .collect();
  return new Map(rows.map((row) => [row.itemId, row.progress]));
}

/** What a viewer sees of one practice row (rows of other types come back unchanged). */
export async function viewerPracticeRow<T extends { _id: string }>(
  ctx: QueryCtx,
  type: string,
  row: T,
  userId: Id<"users">
): Promise<T> {
  const progress =
    practiceItemType(type) === null
      ? undefined
      : (await getViewerProgress(ctx, userId, row._id))?.progress;
  return forViewer(type, row, progress);
}

/** What a viewer sees of a notebook's rows of one practice type. */
export async function viewerPracticeRows<T extends { _id: string }>(
  ctx: QueryCtx,
  type: PracticeItemType,
  rows: T[],
  userId: Id<"users">,
  notebookId: Id<"notebooks">
): Promise<T[]> {
  if (rows.length === 0) return rows;
  const byItem = await listViewerProgressByItem(ctx, userId, notebookId);
  return rows.map((row) => forViewer(type, row, byItem.get(row._id)));
}

/** Deletes up to `limit` progress rows in `scope`; true when none are left. */
export async function deleteProgressRows(
  ctx: MutationCtx,
  scope: ProgressScope,
  limit: number
): Promise<boolean> {
  const rows =
    "itemId" in scope
      ? await ctx.db
          .query("studioProgress")
          .withIndex("by_item", (q) => q.eq("itemId", scope.itemId))
          .take(limit)
      : await ctx.db
          .query("studioProgress")
          .withIndex("by_notebook", (q) => q.eq("notebookId", scope.notebookId))
          .take(limit);
  for (const row of rows) {
    await ctx.db.delete("studioProgress", row._id);
  }
  return rows.length < limit;
}
