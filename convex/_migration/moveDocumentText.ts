/**
 * Migration (#598): move each document's text from the deprecated `documents.extractedMarkdown` to
 * `documentContents`, so reading a document no longer reads its text. A document whose text was
 * already stored in `documentContents` (written by the current code) keeps that copy and only
 * loses the stale one on the row. `updatedAt` is left alone: forks compare it to spot a reprocessed
 * original. Safe to rerun; counts are logged as one JSON line when the scan ends.
 *
 *   npx convex run _migration/moveDocumentText:start '{"dryRun": true}'
 *   npx convex run _migration/moveDocumentText:start '{"dryRun": false}'
 *
 * Once a dry run after the real one reports `moved: 0, cleared: 0` on every deployment, the
 * narrowing follow-up drops the field from the schema along with the fallback in
 * `documents/contents.ts`.
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";

/** Stored text can be ~800 KB per document and is read once and written once: 8 stay well under the limits. */
const MOVE_TEXT_BATCH_SIZE = 8;

const countsValidator = v.object({
  scanned: v.number(),
  moved: v.number(),
  /** Rows whose text was already in `documentContents`; only the stale copy was cleared. */
  cleared: v.number(),
});

export const start = internalMutation({
  args: { dryRun: v.boolean() },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, internal._migration.moveDocumentText.moveBatch, {
      cursor: null,
      dryRun: args.dryRun,
      counts: { scanned: 0, moved: 0, cleared: 0 },
    });
  },
});

export const moveBatch = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    dryRun: v.boolean(),
    counts: countsValidator,
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("documents")
      .paginate({ cursor: args.cursor, numItems: MOVE_TEXT_BATCH_SIZE });
    const counts = { ...args.counts };

    for (const doc of result.page) {
      counts.scanned++;
      if (doc.extractedMarkdown === undefined) continue;
      const existing = await ctx.db
        .query("documentContents")
        .withIndex("by_document", (q) => q.eq("documentId", doc._id))
        .unique();
      if (existing) counts.cleared++;
      else counts.moved++;
      if (args.dryRun) continue;
      if (!existing) {
        await ctx.db.insert("documentContents", {
          documentId: doc._id,
          extractedMarkdown: doc.extractedMarkdown,
        });
      }
      await ctx.db.patch(doc._id, { extractedMarkdown: undefined });
    }

    if (result.isDone) {
      console.log(
        JSON.stringify({ migration: "moveDocumentText", dryRun: args.dryRun, ...counts })
      );
      return;
    }
    await ctx.scheduler.runAfter(0, internal._migration.moveDocumentText.moveBatch, {
      cursor: result.continueCursor,
      dryRun: args.dryRun,
      counts,
    });
  },
});
