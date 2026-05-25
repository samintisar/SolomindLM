import { mutation } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { getAuthUserId } from "../auth";
import { assertCanEditNotebook } from "../_lib/notebookAccess";
import { checkSourceLimit } from "../_lib/limits";
import { deriveFulltextStatus, primaryLinkUrlForPaper } from "./paperRecord";

const MAX_PAPERS = 100;

const bulkUploadPaperValidator = v.object({
  abstract: v.string(),
  authors: v.array(v.string()),
  doi: v.optional(v.string()),
  venue: v.optional(v.string()),
  publicationYear: v.optional(v.number()),
  openAlexId: v.optional(v.string()),
  semanticScholarId: v.optional(v.string()),
  isOa: v.boolean(),
  pdfUrl: v.optional(v.string()),
  landingPageUrl: v.optional(v.string()),
  license: v.optional(v.string()),
  sourceType: v.optional(v.string()),
  title: v.string(),
});

export const bulkUpload = mutation({
  args: {
    notebookId: v.id("notebooks"),
    papers: v.array(bulkUploadPaperValidator),
  },
  returns: v.object({
    imported: v.number(),
    skipped: v.number(),
    failed: v.number(),
    documentIds: v.array(v.id("documents")),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    await assertCanEditNotebook(ctx, args.notebookId, userId);

    if (args.papers.length > MAX_PAPERS) {
      throw new Error(`Cannot import more than ${MAX_PAPERS} papers at once`);
    }

    // Get existing papers for deduplication
    const existingDocs = await ctx.db
      .query("documents")
      .withIndex("by_notebook_and_fileType", (q) =>
        q.eq("notebookId", args.notebookId).eq("fileType", "paper_record")
      )
      .collect();

    const existingDois = new Set<string>();
    const existingTitleHashes = new Set<string>();

    for (const doc of existingDocs) {
      const pr = doc.paperRecord;
      if (!pr) continue;

      if (pr.doi) {
        existingDois.add(pr.doi.toLowerCase().trim());
      }

      const title = doc.fileName || "";
      if (title && pr.authors && pr.authors.length > 0) {
        const firstAuthor = pr.authors[0];
        const hash = `${title.toLowerCase().trim()}|${firstAuthor.split(",")[0].trim().toLowerCase()}`;
        existingTitleHashes.add(hash);
      }
    }

    const now = Date.now();
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    const documentIds: Id<"documents">[] = [];

    for (const paper of args.papers) {
      try {
        // Check for duplicates by DOI
        if (paper.doi) {
          const normalizedDoi = paper.doi.toLowerCase().trim();
          if (existingDois.has(normalizedDoi)) {
            skipped++;
            continue;
          }
        }

        // Check for duplicates by title+firstAuthor hash
        if (paper.title && paper.authors && paper.authors.length > 0) {
          const firstAuthor = paper.authors[0];
          const hash = `${paper.title.toLowerCase().trim()}|${firstAuthor.split(",")[0].trim().toLowerCase()}`;
          if (existingTitleHashes.has(hash)) {
            skipped++;
            continue;
          }
        }

        // Check source limit before inserting
        await checkSourceLimit(ctx, args.notebookId);

        const { title, ...paperRecordFields } = paper;
        const link = primaryLinkUrlForPaper(paperRecordFields);

        const documentId = await ctx.db.insert("documents", {
          userId,
          notebookId: args.notebookId,
          fileName: title,
          fileType: "paper_record",
          fileUrl: link || undefined,
          status: "pending",
          paperRecord: paperRecordFields,
          fulltextStatus: deriveFulltextStatus(paperRecordFields),
          ingestionStatus: "pending",
          createdAt: now,
          updatedAt: now,
        });

        documentIds.push(documentId);
        imported++;

        // Add to existing sets to prevent duplicates within this batch
        if (paper.doi) {
          existingDois.add(paper.doi.toLowerCase().trim());
        }
        if (paper.title && paper.authors && paper.authors.length > 0) {
          const firstAuthor = paper.authors[0];
          const hash = `${paper.title.toLowerCase().trim()}|${firstAuthor.split(",")[0].trim().toLowerCase()}`;
          existingTitleHashes.add(hash);
        }

        // Schedule embedding job
        await ctx.scheduler.runAfter(0, internal.documents.embeddingJob.docEmbedding, {
          documentId,
          userId,
          notebookId: args.notebookId,
        });
      } catch (error) {
        failed++;
        console.error("Failed to import paper:", error);
      }
    }

    return { imported, skipped, failed, documentIds };
  },
});
