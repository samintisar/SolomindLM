/**
 * Migration: index the studio outputs and notes of notebooks created before `studioItems` (#600).
 * Until a notebook is indexed, the Studio list reads its output tables on every run, as before;
 * the first write to an output in it indexes it too.
 *
 *   npx convex run _migration/backfillStudioItems:start
 *
 * Notebooks are walked a page at a time, and each one is indexed in its own mutation so a notebook
 * with very large outputs can't stop the walk. Indexed notebooks are skipped, so it is safe to rerun.
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { indexNotebook, notebookHasStudioItems } from "../_model/studioItems";
import { internalMutation } from "../functions";

const NOTEBOOK_PAGE_SIZE = 50;

export const start = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal._migration.backfillStudioItems.scanNotebooks, {
      cursor: null,
    });
  },
});

export const scanNotebooks = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const result = await ctx.db
      .query("notebooks")
      .paginate({ cursor, numItems: NOTEBOOK_PAGE_SIZE });
    for (const notebook of result.page) {
      if (!(await notebookHasStudioItems(ctx, notebook._id))) {
        await ctx.scheduler.runAfter(0, internal._migration.backfillStudioItems.indexOne, {
          notebookId: notebook._id,
        });
      }
    }
    if (!result.isDone) {
      await ctx.scheduler.runAfter(0, internal._migration.backfillStudioItems.scanNotebooks, {
        cursor: result.continueCursor,
      });
    }
  },
});

export const indexOne = internalMutation({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, { notebookId }) => {
    if (await notebookHasStudioItems(ctx, notebookId)) return;
    await indexNotebook(ctx, notebookId);
  },
});
