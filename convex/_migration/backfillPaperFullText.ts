/**
 * Migration (#480): fix the labels on paper sources stored before open-access resolution, then
 * look for full text again for those that only hold an abstract.
 *
 * Before #480 every paper was marked `ingested`, even when only its abstract stub (or a paywall page)
 * was stored. Relabel: an `ingested` paper with no `fullTextSource` whose stored text fails the
 * full-text test becomes `metadata_only`. No external calls. Re-resolve (opt in): for each completed
 * abstract-only paper with a DOI or OpenAlex id, run the resolver; if it finds a copy other than the
 * PDF link the first import already tried, re-ingest. Re-resolves are spaced 10 s apart.
 *
 *   npx convex run _migration/backfillPaperFullText:start '{"dryRun": true, "reResolve": true}'
 *   npx convex run _migration/backfillPaperFullText:start '{"dryRun": false}'
 *   npx convex run _migration/backfillPaperFullText:start '{"dryRun": false, "reResolve": true}'
 *
 * Counts are logged as one JSON line when the scan ends. Safe to rerun.
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { internalAction, internalMutation } from "../_generated/server";
import { isFullTextLength } from "../_services/extraction/openAccess/fullTextTest";
import {
  candidateKey,
  resolveOpenAccessCandidates,
} from "../_services/extraction/openAccess/OpenAccessResolver";

/** Stored markdown can be ~800 KB per document; 4 per batch stays well under the read limit. */
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

export function hasResolvableId(pr: { doi?: string; openAlexId?: string } | undefined): boolean {
  return Boolean(pr?.doi?.trim() || pr?.openAlexId?.trim());
}

export function hasNewCandidate(
  candidates: Array<{ url: string }>,
  triedPdfUrl: string | undefined
): boolean {
  const tried = triedPdfUrl ? candidateKey(triedPdfUrl) : undefined;
  return candidates.some((c) => candidateKey(c.url) !== tried);
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
      .paginate({ cursor: args.cursor, numItems: BATCH_SIZE });
    const counts = { ...args.counts };

    for (const doc of result.page) {
      if (doc.fileType !== "paper_record") continue;
      counts.scanned++;
      let abstractOnly = doc.ingestionStatus === "metadata_only";

      if (needsAbstractOnlyRelabel(doc)) {
        counts.relabeled++;
        abstractOnly = true;
        if (!args.dryRun) {
          await ctx.db.patch(doc._id, {
            ingestionStatus: "metadata_only",
            fulltextStatus:
              doc.fulltextStatus === "external_only" ? "external_only" : "unavailable",
            updatedAt: Date.now(),
          });
        }
      }

      if (
        args.reResolve &&
        abstractOnly &&
        doc.status === "completed" &&
        hasResolvableId(doc.paperRecord)
      ) {
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

/** Re-ingests one abstract-only paper when the resolver finds a copy the first import didn't try. */
export const reResolve = internalAction({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const doc = await ctx.runQuery(internal.documents.internal.getDocumentDetails, {
      documentId: args.documentId,
    });
    const pr = doc.paperRecord;
    if (doc.ingestionStatus !== "metadata_only" || !pr) return;

    const candidates = await resolveOpenAccessCandidates({
      doi: pr.doi,
      openAlexId: pr.openAlexId,
    });
    const reingest = hasNewCandidate(candidates, pr.pdfUrl);
    console.log(
      JSON.stringify({
        migration: "backfillPaperFullText.reResolve",
        documentId: args.documentId,
        candidates: candidates.length,
        reingest,
      })
    );
    if (reingest) {
      await ctx.runMutation(internal.documents.internal.prepareDocumentReembed, {
        documentId: args.documentId,
        delayMs: 0,
      });
    }
  },
});
