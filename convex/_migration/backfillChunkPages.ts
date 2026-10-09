/**
 * Migration: set `documentChunks.pageNumber` on chunks stored before the chunker read OCR page labels.
 *
 * For each document whose `extractedMarkdown` has `**Page N**` labels, every chunk's text is found in the
 * markdown and given the page of the nearest label at or before it. Only chunks without a page are filled, so a
 * page the chunker wrote is never changed. Chunk text and embeddings are untouched; a chunk that can't be
 * found, or whose text repeats on different pages, keeps no page. Safe to rerun.
 *
 *   npx convex run _migration/backfillChunkPages:start
 *
 * Convex allows one paginated query per function, so documents and chunks are walked by two mutations
 * that schedule each other.
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { chunkPage, hasPageLabels, pageAtOffset } from "../_services/processing/pageLabels";

/** Chunk rows carry a 1536-float embedding (~13 KB), so 200 rows stay far below the per-function read limit. */
const CHUNK_BATCH_SIZE = 200;

export const start = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal._migration.backfillChunkPages.scanDocuments, {
      cursor: null,
    });
  },
});

/** Reads one document (stored markdown can be ~800 KB) and hands paginated ones to the chunk pass. */
export const scanDocuments = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const result = await ctx.db.query("documents").paginate({ cursor, numItems: 1 });
    const nextCursor = result.isDone ? null : result.continueCursor;
    const doc = result.page[0];

    if (doc?.extractedMarkdown && hasPageLabels(doc.extractedMarkdown)) {
      await ctx.scheduler.runAfter(
        0,
        internal._migration.backfillChunkPages.backfillDocumentChunks,
        { documentId: doc._id, chunkCursor: null, documentCursor: nextCursor }
      );
      return;
    }
    if (nextCursor !== null) {
      await ctx.scheduler.runAfter(0, internal._migration.backfillChunkPages.scanDocuments, {
        cursor: nextCursor,
      });
    }
  },
});

export const backfillDocumentChunks = internalMutation({
  args: {
    documentId: v.id("documents"),
    chunkCursor: v.union(v.string(), v.null()),
    /** Where `scanDocuments` resumes once this document is done; null when it was the last one. */
    documentCursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { documentId, chunkCursor, documentCursor }) => {
    const markdown = (await ctx.db.get(documentId))?.extractedMarkdown;
    if (markdown) {
      const lookup = pageAtOffset(markdown);
      const result = await ctx.db
        .query("documentChunks")
        .withIndex("by_document", (q) => q.eq("documentId", documentId))
        .paginate({ cursor: chunkCursor, numItems: CHUNK_BATCH_SIZE });

      for (const chunk of result.page) {
        // The chunker already set an exact page; a text search could pick a repeated passage on another page.
        if (chunk.pageNumber != null) continue;
        // Null when the text isn't found or repeats across pages: a page we can't place stays unset.
        const pageNumber = chunkPage(markdown, chunk.content, lookup);
        if (pageNumber !== null) {
          await ctx.db.patch(chunk._id, { pageNumber });
        }
      }

      if (!result.isDone) {
        await ctx.scheduler.runAfter(
          0,
          internal._migration.backfillChunkPages.backfillDocumentChunks,
          { documentId, chunkCursor: result.continueCursor, documentCursor }
        );
        return;
      }
    }

    if (documentCursor !== null) {
      await ctx.scheduler.runAfter(0, internal._migration.backfillChunkPages.scanDocuments, {
        cursor: documentCursor,
      });
    }
  },
});
