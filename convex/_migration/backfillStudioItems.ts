/**
 * Migration: index the studio outputs and notes of notebooks created before `studioItems` (#600).
 * Until a notebook is indexed, the Studio list reads its output tables on every run, as before;
 * the first write to an output in it starts indexing it too (`startIndexing`).
 *
 *   npx convex run _migration/backfillStudioItems:start
 *
 * Notebooks are walked a page at a time. Each one is indexed by its own chain of `indexPage`
 * mutations, a few outputs per mutation, so large outputs stay inside a mutation's read limits.
 * Indexed notebooks are skipped and unfinished ones restarted, so it is safe to rerun.
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { indexNotebookPage, isNotebookIndexed, startIndexing } from "../_model/studioItems";
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
      if (!(await isNotebookIndexed(ctx, notebook._id))) await startIndexing(ctx, notebook._id);
    }
    if (!result.isDone) {
      await ctx.scheduler.runAfter(0, internal._migration.backfillStudioItems.scanNotebooks, {
        cursor: result.continueCursor,
      });
    }
  },
});

/** One page of a notebook's outputs; schedules the next page until the notebook is done. */
export const indexPage = internalMutation({
  args: {
    notebookId: v.id("notebooks"),
    tableIndex: v.number(),
    after: v.union(v.number(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { notebookId, tableIndex, after }) => {
    if (await isNotebookIndexed(ctx, notebookId)) return null;
    const next = await indexNotebookPage(ctx, notebookId, { tableIndex, after });
    if (next) {
      await ctx.scheduler.runAfter(0, internal._migration.backfillStudioItems.indexPage, {
        notebookId,
        ...next,
      });
    }
    return null;
  },
});
