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

const userError = (message: string) => toConvexError(new InputValidationError(message));

/** The caller's paper source, if they can edit it and it isn't mid-ingest. */
async function editablePaper(
  ctx: MutationCtx,
  documentId: Id<"documents">
): Promise<{ userId: Id<"users">; doc: Doc<"documents"> }> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Unauthenticated");
  const doc = await ctx.db.get(documentId);
  if (!doc) throw new Error("Document not found");
  await assertCanEditNotebook(ctx, doc.notebookId, userId);
  if (doc.fileType !== "paper_record") throw userError("Only paper sources have this option.");
  if (doc.status === "pending" || doc.status === "processing") {
    throw userError("This source is still being processed.");
  }
  return { userId, doc };
}

/** Looks for open-access full text again (re-runs the whole paper ingest). */
export const findFullText = mutation({
  args: { documentId: v.id("documents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await editablePaper(ctx, args.documentId);
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
    const { userId } = await editablePaper(ctx, args.documentId);

    const reject = async (reason: string) => {
      await ctx.storage.delete(args.storageId);
      return { ok: false as const, reason };
    };

    const file = await ctx.db.system.get(args.storageId);
    if (!file) return { ok: false as const, reason: "The upload didn't arrive. Try again." };
    if (file.contentType !== "application/pdf") return reject("Choose a PDF file.");
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
