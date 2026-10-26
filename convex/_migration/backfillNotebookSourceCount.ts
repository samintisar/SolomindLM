/**
 * Migration: set `notebooks.sourceCount` on notebooks created before the count was stored (#589).
 * Until a notebook has it, the notebook list counts its documents on every read.
 *
 *   npx convex run _migration/backfillNotebookSourceCount:start
 *   npx convex run _migration/backfillNotebookSourceCount:start '{"force": true}'
 *
 * Each notebook is counted and written in one transaction of its own: counting across several
 * would miss a document deleted in between (the documents trigger leaves a notebook without a
 * count alone), and a notebook whose rows still carry extracted text (before
 * `_migration/moveDocumentText`) fails alone instead of stopping the scan. Without `force`,
 * notebooks that already have a count are skipped, so it is safe to rerun. `force` recounts every
 * notebook, repairing counts that drifted through writes that skip the triggers (dashboard edits,
 * `npx convex import`).
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { getDocumentCountByNotebook } from "../_model/notebooks";
import { internalMutation } from "../functions";

const NOTEBOOK_PAGE_SIZE = 50;

export const start = internalMutation({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, { force }) => {
    await ctx.scheduler.runAfter(0, internal._migration.backfillNotebookSourceCount.scanNotebooks, {
      cursor: null,
      force: force ?? false,
    });
  },
});

export const scanNotebooks = internalMutation({
  args: { cursor: v.union(v.string(), v.null()), force: v.boolean() },
  handler: async (ctx, { cursor, force }) => {
    const result = await ctx.db
      .query("notebooks")
      .paginate({ cursor, numItems: NOTEBOOK_PAGE_SIZE });

    for (const notebook of result.page) {
      if (!force && notebook.sourceCount !== undefined) continue;
      await ctx.scheduler.runAfter(
        0,
        internal._migration.backfillNotebookSourceCount.countNotebook,
        { notebookId: notebook._id, force }
      );
    }

    if (!result.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal._migration.backfillNotebookSourceCount.scanNotebooks,
        { cursor: result.continueCursor, force }
      );
    }
  },
});

export const countNotebook = internalMutation({
  args: { notebookId: v.id("notebooks"), force: v.boolean() },
  handler: async (ctx, { notebookId, force }) => {
    const notebook = await ctx.db.get("notebooks", notebookId);
    if (!notebook || (!force && notebook.sourceCount !== undefined)) return;
    await ctx.db.patch("notebooks", notebookId, {
      sourceCount: await getDocumentCountByNotebook(ctx, notebookId),
    });
  },
});
