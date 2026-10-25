/**
 * Migration: set `notebooks.sourceCount` on notebooks created before the count was stored (#589).
 * Until a notebook has it, the notebook list counts its documents on every read.
 *
 *   npx convex run _migration/backfillNotebookSourceCount:start
 *
 * Convex allows one paginated query per function, so notebooks and their documents are walked by
 * two mutations that schedule each other. Documents carry their extracted text (up to ~800 KB), so
 * they are counted a small page at a time, and the count is written with the last page. Notebooks
 * that already have a count are skipped, so it is safe to rerun.
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../functions";

/** Small enough that 10 documents with full extracted text stay under the per-function read limit. */
const DOCUMENT_BATCH_SIZE = 10;

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
    const result = await ctx.db.query("notebooks").paginate({ cursor, numItems: 1 });
    const nextCursor = result.isDone ? null : result.continueCursor;
    const notebook = result.page[0];

    if (notebook && notebook.sourceCount === undefined) {
      await ctx.scheduler.runAfter(
        0,
        internal._migration.backfillNotebookSourceCount.countDocuments,
        { notebookId: notebook._id, documentCursor: null, counted: 0, notebookCursor: nextCursor }
      );
      return;
    }
    if (nextCursor !== null) {
      await ctx.scheduler.runAfter(
        0,
        internal._migration.backfillNotebookSourceCount.scanNotebooks,
        {
          cursor: nextCursor,
        }
      );
    }
  },
});

export const countDocuments = internalMutation({
  args: {
    notebookId: v.id("notebooks"),
    documentCursor: v.union(v.string(), v.null()),
    counted: v.number(),
    /** Where `scanNotebooks` resumes once this notebook is counted; null when it was the last one. */
    notebookCursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { notebookId, documentCursor, counted, notebookCursor }) => {
    const result = await ctx.db
      .query("documents")
      .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
      .paginate({ cursor: documentCursor, numItems: DOCUMENT_BATCH_SIZE });
    const total = counted + result.page.length;

    if (!result.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal._migration.backfillNotebookSourceCount.countDocuments,
        { notebookId, documentCursor: result.continueCursor, counted: total, notebookCursor }
      );
      return;
    }

    const notebook = await ctx.db.get("notebooks", notebookId);
    if (notebook && notebook.sourceCount === undefined) {
      await ctx.db.patch("notebooks", notebookId, { sourceCount: total });
    }
    if (notebookCursor !== null) {
      await ctx.scheduler.runAfter(
        0,
        internal._migration.backfillNotebookSourceCount.scanNotebooks,
        {
          cursor: notebookCursor,
        }
      );
    }
  },
});
