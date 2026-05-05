import { v } from "convex/values";
import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { getAuthUserId } from "../auth";
import { assertCanEditNotebook } from "../_lib/notebookAccess";
import { createServiceLogger } from "../_lib/logging/serviceLogger";

/**
 * Add discovered external sources (from web/academic/news search) to a notebook.
 * Creates document records and triggers embedding pipeline for each source.
 */
export const addExternalSources = mutation({
  args: {
    notebookId: v.id("notebooks"),
    sources: v.array(
      v.object({
        title: v.string(),
        url: v.string(),
        snippet: v.optional(v.string()),
        sourceType: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    await assertCanEditNotebook(ctx, args.notebookId, userId);

    const logger = createServiceLogger("documents", "addExternalSources", {
      userId,
      notebookId: args.notebookId,
    });

    logger.operationStart({ sourceCount: args.sources.length });

    const now = Date.now();
    const createdIds: Id<"documents">[] = [];

    for (const source of args.sources) {
      // Deduplicate: skip if URL already exists in this notebook
      const existing = await ctx.db
        .query("documents")
        .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
        .filter((q) => q.eq(q.field("fileUrl"), source.url))
        .first();

      if (existing) {
        logger.info("skipped_duplicate_source", { url: source.url });
        continue;
      }

      const documentId = await ctx.db.insert("documents", {
        userId,
        notebookId: args.notebookId,
        fileName: source.title,
        fileType: source.sourceType === "academic" ? "paper_record" : "url",
        fileUrl: source.url,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      });

      createdIds.push(documentId);

      // Schedule embedding job for each document
      await ctx.scheduler.runAfter(0, internal.documents.embeddingJob.docEmbedding, {
        documentId,
        notebookId: args.notebookId,
        userId,
      });
    }

    logger.operationComplete({
      createdCount: createdIds.length,
      skippedCount: args.sources.length - createdIds.length,
    });

    return createdIds;
  },
});
