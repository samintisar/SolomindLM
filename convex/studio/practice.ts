/**
 * Practice actions shared by flashcards, quizzes and written questions: remembering the last card
 * or question viewed, "Try again", and deleting viewers' progress when an item or notebook goes.
 * Owners and editors write to the shared row; a public notebook's viewer writes to their own
 * `studioProgress` row (`convex/_model/studioProgress.ts`).
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { internalMutation, type MutationCtx, mutation } from "../_generated/server";
import { InputValidationError } from "../_lib/errors";
import { toConvexError } from "../_lib/serviceErrors";
import {
  type PracticeItemType,
  withLastViewedIndex,
  withoutAnswers,
} from "../_model/practiceProgress";
import {
  deleteProgressRows,
  getPracticeTarget,
  type ProgressScope,
  saveViewerProgress,
} from "../_model/studioProgress";
import { getAuthUserId } from "../auth";

/** Progress rows deleted per transaction when an item or notebook is deleted. */
const PROGRESS_DELETE_BATCH = 500;

const practiceItemTypeValidator = v.union(
  v.literal("flashcards"),
  v.literal("quizzes"),
  v.literal("writtenQuestions")
);

const progressScopeValidator = v.union(
  v.object({ notebookId: v.id("notebooks") }),
  v.object({ itemId: v.string() })
);

/** The practice row `itemId` names in the `itemType` table; refuses an id from any other table. */
async function getPracticeItem<T extends PracticeItemType>(
  ctx: MutationCtx,
  itemType: T,
  itemId: string
): Promise<Doc<T>> {
  const id = ctx.db.normalizeId(itemType, itemId);
  const item = id === null ? null : await ctx.db.get(itemType, id);
  if (!item) throw new Error("Studio item not found");
  return item;
}

/** Owner/editor path: merges `fields` into the shared row's metadata, as `update` did. */
async function patchSharedMetadata(
  ctx: MutationCtx,
  itemType: PracticeItemType,
  item: Doc<PracticeItemType>,
  fields: Record<string, unknown>
): Promise<void> {
  const patch = { metadata: { ...(item.metadata ?? {}), ...fields }, updatedAt: Date.now() };
  // Resolve the id against its own table so each patch names it (the union id can't).
  switch (itemType) {
    case "flashcards": {
      const id = ctx.db.normalizeId("flashcards", item._id);
      if (id) await ctx.db.patch("flashcards", id, patch);
      return;
    }
    case "quizzes": {
      const id = ctx.db.normalizeId("quizzes", item._id);
      if (id) await ctx.db.patch("quizzes", id, patch);
      return;
    }
    case "writtenQuestions": {
      const id = ctx.db.normalizeId("writtenQuestions", item._id);
      if (id) await ctx.db.patch("writtenQuestions", id, patch);
      return;
    }
  }
}

/** Remembers the last card or question viewed (the web app debounces it). */
export const setLastViewedIndex = mutation({
  args: { itemType: practiceItemTypeValidator, itemId: v.string(), index: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    if (!Number.isInteger(args.index) || args.index < 0) {
      throw toConvexError(new InputValidationError("Invalid index", { field: "index" }));
    }

    const item = await getPracticeItem(ctx, args.itemType, args.itemId);
    if ((await getPracticeTarget(ctx, item.notebookId, userId)) === "viewer") {
      await saveViewerProgress(
        ctx,
        { userId, itemType: args.itemType, itemId: item._id, notebookId: item.notebookId },
        (current) => withLastViewedIndex(current, args.index)
      );
      return null;
    }
    await patchSharedMetadata(ctx, args.itemType, item, { lastViewedIndex: args.index });
    return null;
  },
});

/** "Try again": clears the answers and goes back to the first question. */
export const resetAnswers = mutation({
  args: {
    itemType: v.union(v.literal("quizzes"), v.literal("writtenQuestions")),
    itemId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const item = await getPracticeItem(ctx, args.itemType, args.itemId);
    if ((await getPracticeTarget(ctx, item.notebookId, userId)) === "viewer") {
      await saveViewerProgress(
        ctx,
        { userId, itemType: args.itemType, itemId: item._id, notebookId: item.notebookId },
        withoutAnswers
      );
      return null;
    }
    await patchSharedMetadata(ctx, args.itemType, item, { userAnswers: {}, lastViewedIndex: 0 });
    return null;
  },
});

/**
 * Deletes every viewer's progress on a deleted studio item or notebook: one batch now, the rest
 * in scheduled batches, since a popular public notebook can have many viewers.
 */
export async function deletePracticeProgress(
  ctx: MutationCtx,
  scope: ProgressScope
): Promise<void> {
  const done = await deleteProgressRows(ctx, scope, PROGRESS_DELETE_BATCH);
  if (!done) {
    await ctx.scheduler.runAfter(0, internal.studio.practice.deleteProgressBatch, { scope });
  }
}

export const deleteProgressBatch = internalMutation({
  args: { scope: progressScopeValidator },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await deletePracticeProgress(ctx, args.scope);
    return null;
  },
});
