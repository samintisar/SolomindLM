/**
 * Open-access full text for paper sources (#480): mutations the embedding job uses to record
 * what it found, and the user actions to look again or attach a PDF.
 */

import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx, mutation } from "../_generated/server";
import { InputValidationError } from "../_lib/errors";
import { assertCanEditNotebook } from "../_lib/notebookAccess";
import { rateLimiter } from "../_lib/rateLimits";
import { toConvexError } from "../_lib/serviceErrors";
import { MAX_PDF_BYTES } from "../_services/extraction/openAccess/fetchOaCandidate";
import { getAuthUserId } from "../auth";
import { resetDocumentForReembed } from "./internal";
import {
  fullTextSourceValidator,
  fulltextStatusValidator,
  ingestionStatusValidator,
} from "./paperRecord";

/** Sets or (with no `storageId`) clears a paper source's stored PDF. Doesn't delete blobs. */
export const setPaperStorage = internalMutation({
  args: { documentId: v.id("documents"), storageId: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.documentId, { storageId: args.storageId, updatedAt: Date.now() });
    return null;
  },
});

/** Records an ingest outcome. A missing `fullTextSource` clears the old one (abstract only). */
export const recordPaperIngest = internalMutation({
  args: {
    documentId: v.id("documents"),
    ingestionStatus: ingestionStatusValidator,
    fulltextStatus: fulltextStatusValidator,
    fullTextSource: v.optional(fullTextSourceValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.documentId, {
      ingestionStatus: args.ingestionStatus,
      fulltextStatus: args.fulltextStatus,
      fullTextSource: args.fullTextSource,
      updatedAt: Date.now(),
    });
    return null;
  },
});

const RATE_LIMITED = "You've looked for full text often in the last hour. Try again later.";

/** How recently a blob must have been uploaded for `attachPdf` to delete it when refusing it. */
const FRESH_UPLOAD_MS = 15 * 60_000;

const UPLOAD_MISSING = "The upload didn't arrive. Try again.";

const SOURCE_MISSING = "This source no longer exists.";

const userError = (message: string) => toConvexError(new InputValidationError(message));

async function requireUserId(ctx: MutationCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw userError("Sign in to do this.");
  return userId;
}

/** The caller's source, if they can edit its notebook. Throws when they can't. */
async function editableSource(
  ctx: MutationCtx,
  documentId: Id<"documents">
): Promise<{ userId: Id<"users">; doc: Doc<"documents"> }> {
  const userId = await requireUserId(ctx);
  const doc = await ctx.db.get(documentId);
  if (!doc) throw userError(SOURCE_MISSING);
  await assertCanEditNotebook(ctx, doc.notebookId, userId);
  return { userId, doc };
}

/** Why this source can't be re-ingested right now, or null when it can. */
function paperStateProblem(doc: Doc<"documents">): string | null {
  if (doc.fileType !== "paper_record") return "Only paper sources have this option.";
  // Forked notebooks copy paper sources without their paper record, which the ingest needs.
  if (!doc.paperRecord) return "This paper has no details to look up. Add it again from search.";
  if (doc.status === "pending" || doc.status === "processing") {
    return "This source is still being processed.";
  }
  return null;
}

/** Looks for open-access full text again (re-runs the whole paper ingest). */
export const findFullText = mutation({
  args: { documentId: v.id("documents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, doc } = await editableSource(ctx, args.documentId);
    const problem = paperStateProblem(doc);
    if (problem) throw userError(problem);
    const { ok } = await rateLimiter.limit(ctx, "paperFullText", { key: userId });
    if (!ok) throw userError(RATE_LIMITED);
    await resetDocumentForReembed(ctx, { documentId: args.documentId, delayMs: 0 });
    return null;
  },
});

/**
 * Attaches a PDF the user uploaded to a paper source and re-ingests from it. Invalid uploads are
 * deleted and reported in the result (throwing would roll the delete back).
 */
export const attachPdf = mutation({
  args: { documentId: v.id("documents"), storageId: v.id("_storage") },
  returns: v.union(
    v.object({ ok: v.literal(true) }),
    v.object({ ok: v.literal(false), reason: v.string() })
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    // A blob some record already references isn't a fresh upload: leave it alone, never delete it.
    const referencedByDocument = await ctx.db
      .query("documents")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .first();
    const referencedByAudio = await ctx.db
      .query("audioOverviews")
      .withIndex("by_audioStorageId", (q) => q.eq("audioStorageId", args.storageId))
      .first();
    if (referencedByDocument || referencedByAudio) {
      return { ok: false as const, reason: UPLOAD_MISSING };
    }

    const file = await ctx.db.system.get(args.storageId);
    if (!file) return { ok: false as const, reason: UPLOAD_MISSING };

    // Backstop for blobs referenced from tables we don't check: only an upload made moments ago
    // can be deleted here.
    const reject = async (reason: string) => {
      if (file._creationTime > Date.now() - FRESH_UPLOAD_MS) {
        await ctx.storage.delete(args.storageId);
      }
      return { ok: false as const, reason };
    };

    // Report a missing source or lost access through `reject`, so the fresh upload is deleted.
    const doc = await ctx.db.get(args.documentId);
    if (!doc) return reject(SOURCE_MISSING);
    try {
      await assertCanEditNotebook(ctx, doc.notebookId, userId);
    } catch {
      return reject("You can't edit this notebook.");
    }

    const problem = paperStateProblem(doc);
    if (problem) return reject(problem);

    const type = file.contentType?.split(";")[0].trim().toLowerCase();
    if (type !== "application/pdf" && type !== "application/x-pdf") {
      return reject("Choose a PDF file.");
    }
    if (file.size > MAX_PDF_BYTES) return reject("That PDF is over 50 MB.");

    const { ok } = await rateLimiter.limit(ctx, "paperFullText", { key: userId });
    if (!ok) return reject(RATE_LIMITED);

    await resetDocumentForReembed(ctx, {
      documentId: args.documentId,
      delayMs: 0,
      newStorageId: args.storageId,
    });
    return { ok: true as const };
  },
});
