/**
 * Migration: set `notebooks.sourceCount` on notebooks created before the count was stored (#589).
 * Until a notebook has it, the notebook list counts its documents on every read.
 *
 *   npx convex run _migration/backfillNotebookSourceCount:start
 *
 * Run it after `_migration/moveDocumentText`: once document rows no longer carry their extracted
 * text they are small, so each notebook is counted and written in one transaction. Counting
 * across several would miss a document deleted in between, since the documents trigger leaves a
 * notebook without a count alone. Notebooks that already have a count are skipped, so it is safe
 * to rerun.
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { getDocumentCountByNotebook } from "../_model/notebooks";
import { internalMutation } from "../functions";

/** A notebook holds at most 200 sources, so 10 notebooks stay well under the per-function read limit. */
const NOTEBOOK_BATCH_SIZE = 10;

export const start = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal._migration.backfillNotebookSourceCount.scanNotebooks, {
      cursor: null,
    });
  },
});

export const scanNotebooks = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const result = await ctx.db
      .query("notebooks")
      .paginate({ cursor, numItems: NOTEBOOK_BATCH_SIZE });

    for (const notebook of result.page) {
      if (notebook.sourceCount !== undefined) continue;
      await ctx.db.patch("notebooks", notebook._id, {
        sourceCount: await getDocumentCountByNotebook(ctx, notebook._id),
      });
    }

    if (!result.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal._migration.backfillNotebookSourceCount.scanNotebooks,
        { cursor: result.continueCursor }
      );
    }
  },
});
