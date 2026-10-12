/**
 * Open-access full text for paper sources (#480): mutations the embedding job uses to record
 * what it found, and (Task 8) the user actions to look again or attach a PDF.
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
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
