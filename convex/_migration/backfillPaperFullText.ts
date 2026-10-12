/**
 * Migration (#480): fix the labels on paper sources stored before open-access resolution, then
 * look for full text again for the ones it relabels.
 *
 * Before #480 every paper was marked `ingested`, even when only its abstract stub (or a paywall page)
 * was stored. Relabel: an `ingested` paper with no `fullTextSource` whose stored text fails the
 * full-text test becomes `metadata_only`. No external calls. Re-resolve (opt in, same pass): each
 * paper relabeled in this pass that is completed and has a DOI, an OpenAlex id or a PDF link is
 * queued, spaced 10 s apart. The queued action runs the resolver with the record's ids and its own
 * PDF link (the old pipeline never checked that link's output) and re-ingests when it finds any
 * candidate, provided the row is still an abstract-only paper. Papers that were already
 * `metadata_only` were tried by the new pipeline and are never queued, so rerunning finds nothing
 * new to relabel and queues nothing.
 *
 *   npx convex run _migration/backfillPaperFullText:start '{"dryRun": true, "reResolve": true}'
 *   npx convex run _migration/backfillPaperFullText:start '{"dryRun": false, "reResolve": true}'
 *   npx convex run _migration/backfillPaperFullText:start '{"dryRun": false}'   # relabel only
 *
 * A relabel-only run gives up re-resolve for the papers it relabels: a later run won't queue them
 * (they're no longer `ingested`), so only "Find full text" recovers them. Pass `reResolve: true` on
 * the real run. Counts are logged as one JSON line when the scan ends. A dry run counts `queued`
 * without scheduling.
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { isFullTextLength } from "../_services/extraction/openAccess/fullTextTest";
import { resolveOpenAccessCandidates } from "../_services/extraction/openAccess/OpenAccessResolver";
import { resetDocumentForReembed } from "../documents/internal";

/** Stored markdown can be ~800 KB per paper; 4 per batch stays well under the read limit. */
const BATCH_SIZE = 4;
const RE_RESOLVE_SPACING_MS = 10_000;

const countsValidator = v.object({
  scanned: v.number(),
  relabeled: v.number(),
  queued: v.number(),
});

export function needsAbstractOnlyRelabel(
  doc: Pick<
    Doc<"documents">,
    "fileType" | "ingestionStatus" | "fullTextSource" | "extractedMarkdown" | "paperRecord"
  >
): boolean {
  return (
    doc.fileType === "paper_record" &&
    doc.ingestionStatus === "ingested" &&
    !doc.fullTextSource &&
    !isFullTextLength(doc.extractedMarkdown ?? "", doc.paperRecord?.abstract)
  );
}

function hasResolvableId(pr: { doi?: string; openAlexId?: string } | undefined): boolean {
  return Boolean(pr?.doi?.trim() || pr?.openAlexId?.trim());
}

/** A relabeled, completed paper the resolver has something to look up for (an id or its own PDF link). */
export function shouldQueueReResolve(
  doc: Pick<
    Doc<"documents">,
    | "fileType"
    | "status"
    | "ingestionStatus"
    | "fullTextSource"
    | "extractedMarkdown"
    | "paperRecord"
  >
): boolean {
  return (
    needsAbstractOnlyRelabel(doc) &&
    doc.status === "completed" &&
    (hasResolvableId(doc.paperRecord) || Boolean(doc.paperRecord?.pdfUrl?.trim()))
  );
}

export const start = internalMutation({
  args: { dryRun: v.boolean(), reResolve: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, internal._migration.backfillPaperFullText.scan, {
      cursor: null,
      dryRun: args.dryRun,
      reResolve: args.reResolve ?? false,
      counts: { scanned: 0, relabeled: 0, queued: 0 },
    });
  },
});

export const scan = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    dryRun: v.boolean(),
    reResolve: v.boolean(),
    counts: countsValidator,
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("documents")
      .withIndex("by_fileType", (q) => q.eq("fileType", "paper_record"))
      .paginate({ cursor: args.cursor, numItems: BATCH_SIZE });
    const counts = { ...args.counts };

    for (const doc of result.page) {
      counts.scanned++;
      const relabel = needsAbstractOnlyRelabel(doc);
      const queue = args.reResolve && shouldQueueReResolve(doc);

      if (relabel) {
        counts.relabeled++;
        if (!args.dryRun) {
          await ctx.db.patch(doc._id, {
            ingestionStatus: "metadata_only",
            fulltextStatus:
              doc.fulltextStatus === "external_only" ? "external_only" : "unavailable",
            updatedAt: Date.now(),
          });
        }
      }

      if (queue) {
        if (!args.dryRun) {
          await ctx.scheduler.runAfter(
            counts.queued * RE_RESOLVE_SPACING_MS,
            internal._migration.backfillPaperFullText.reResolve,
            { documentId: doc._id }
          );
        }
        counts.queued++;
      }
    }

    if (result.isDone) {
      console.log(
        JSON.stringify({
          migration: "backfillPaperFullText",
          dryRun: args.dryRun,
          reResolve: args.reResolve,
          ...counts,
        })
      );
      return;
    }
    await ctx.scheduler.runAfter(0, internal._migration.backfillPaperFullText.scan, {
      cursor: result.continueCursor,
      dryRun: args.dryRun,
      reResolve: args.reResolve,
      counts,
    });
  },
});

/** What the re-resolve action needs from a document; null when it has been deleted. */
export const getReResolveInput = internalQuery({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) return null;
    return {
      fileType: doc.fileType,
      ingestionStatus: doc.ingestionStatus,
      paperRecord: doc.paperRecord,
    };
  },
});

/** Re-ingests a paper unless it was deleted, replaced or already re-ingested since it was queued. */
export const reingestIfStillAbstractOnly = internalMutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (
      !doc ||
      doc.fileType !== "paper_record" ||
      doc.status !== "completed" ||
      doc.ingestionStatus !== "metadata_only"
    ) {
      return false;
    }
    await resetDocumentForReembed(ctx, { documentId: args.documentId, delayMs: 0 });
    return true;
  },
});

/** Looks for a copy of one relabeled paper and re-ingests it when the resolver finds any candidate. */
export const reResolve = internalAction({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const doc = await ctx.runQuery(internal._migration.backfillPaperFullText.getReResolveInput, {
      documentId: args.documentId,
    });
    const pr = doc?.paperRecord;
    if (!doc || doc.fileType !== "paper_record" || doc.ingestionStatus !== "metadata_only" || !pr) {
      return;
    }

    const candidates = await resolveOpenAccessCandidates({
      doi: pr.doi,
      openAlexId: pr.openAlexId,
      pdfUrl: pr.pdfUrl,
    });
    const reingest = candidates.length > 0;
    console.log(
      JSON.stringify({
        migration: "backfillPaperFullText.reResolve",
        documentId: args.documentId,
        candidates: candidates.length,
        reingest,
      })
    );
    if (reingest) {
      await ctx.runMutation(internal._migration.backfillPaperFullText.reingestIfStillAbstractOnly, {
        documentId: args.documentId,
      });
    }
  },
});
