import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { InputValidationError } from "../_lib/errors";
import { toConvexError } from "../_lib/serviceErrors";
import {
  getChatLinkedLiteratureArtifactIds,
  isChatLiteratureReport,
  isChatLiteratureTable,
} from "../_model/literatureArtifacts";

const MAX_FORK_DOCUMENTS = 200;

/**
 * Chunks copied per transaction. A chunk carries a 1536-float embedding (~13 KB), so a batch
 * reads and writes ~1.5 MB, well under the per-mutation limits even with the source's text.
 */
export const FORK_CHUNK_BATCH_SIZE = 100;

/**
 * Copies one forked source's text and chunks from the original, a batch per run, rescheduling
 * itself until done; then marks the copy completed. Stops if the copy has been deleted meanwhile.
 */
export const copyForkedDocumentContent = internalMutation({
  args: {
    sourceDocumentId: v.id("documents"),
    forkDocumentId: v.id("documents"),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { sourceDocumentId, forkDocumentId, cursor }) => {
    const fork = await ctx.db.get(forkDocumentId);
    if (!fork) return null;
    const source = await ctx.db.get(sourceDocumentId);
    if (!source) {
      // Without the original there is nothing left to copy; don't leave the copy spinning.
      await ctx.db.patch(forkDocumentId, {
        status: "failed",
        error: "The original source was deleted before it finished copying.",
        updatedAt: Date.now(),
      });
      return null;
    }

    if (cursor === null && source.extractedMarkdown !== undefined) {
      await ctx.db.patch(forkDocumentId, { extractedMarkdown: source.extractedMarkdown });
    }

    const batch = await ctx.db
      .query("documentChunks")
      .withIndex("by_document", (q) => q.eq("documentId", sourceDocumentId))
      .paginate({ cursor, numItems: FORK_CHUNK_BATCH_SIZE });

    const now = Date.now();
    for (const c of batch.page) {
      const { _id, _creationTime, documentId, userId, notebookId, createdAt, ...fields } = c;
      await ctx.db.insert("documentChunks", {
        ...fields,
        documentId: forkDocumentId,
        userId: fork.userId,
        notebookId: fork.notebookId,
        createdAt: now,
      });
    }

    if (!batch.isDone) {
      await ctx.scheduler.runAfter(0, internal.notebooks._forkNotebook.copyForkedDocumentContent, {
        sourceDocumentId,
        forkDocumentId,
        cursor: batch.continueCursor,
      });
      return null;
    }

    await ctx.db.patch(forkDocumentId, { status: "completed", updatedAt: now });
    return null;
  },
});

/**
 * A forked studio item must point at the fork's own copies of its sources, not the original's.
 * Rewrites the id list stored under `field` through docIdMap and drops ids that have no copy.
 */
function remapDocumentIds(
  metadata: unknown,
  field: string,
  docIdMap: Map<Id<"documents">, Id<"documents">>
): unknown {
  const stored = metadata as Record<string, unknown> | undefined;
  const documentIds = stored?.[field];
  if (!Array.isArray(documentIds)) return metadata;
  return {
    ...stored,
    [field]: documentIds.flatMap((id) => {
      const forked = docIdMap.get(id as Id<"documents">);
      return forked ? [forked] : [];
    }),
  };
}

/** A completed infographic repeats its source ids in `data.metadata`, so remap that copy too. */
function remapInfographicData(
  data: unknown,
  docIdMap: Map<Id<"documents">, Id<"documents">>
): unknown {
  const stored = data as Record<string, unknown> | undefined;
  if (stored?.metadata === undefined) return data;
  return {
    ...stored,
    metadata: remapDocumentIds(stored.metadata, "sourceDocumentIds", docIdMap),
  };
}

/**
 * An unfinished overview lists its chunk MP3s in `metadata.synthesis`, and failing or finishing a
 * row deletes those files. The fork's row has no job of its own, so it must not name the source's.
 */
function withoutSynthesisChunks(metadata: unknown): unknown {
  const stored = metadata as Record<string, unknown> | undefined;
  if (stored?.synthesis === undefined) return metadata;
  const { synthesis: _synthesis, ...rest } = stored;
  return rest;
}

/**
 * Deep-copies a notebook into forkUserId's account (a helper for fork mutations, not an API).
 * Copies everything but the sources' text and chunks in this transaction; those follow in one
 * scheduled copyForkedDocumentContent run per source, each source showing as processing until then.
 */
export async function performNotebookFork(
  ctx: MutationCtx,
  sourceNotebookId: Id<"notebooks">,
  forkUserId: Id<"users">
): Promise<Id<"notebooks">> {
  const source = await ctx.db.get(sourceNotebookId);
  if (!source) {
    throw new Error("Source notebook not found");
  }

  const now = Date.now();
  const newNotebookId = await ctx.db.insert("notebooks", {
    userId: forkUserId,
    title: `${source.title} (copy)`,
    coverColor: source.coverColor,
    icon: source.icon,
    isFeatured: false,
    folderId: undefined,
    createdAt: now,
    updatedAt: now,
  });

  const docs = await ctx.db
    .query("documents")
    .withIndex("by_notebook_and_status", (q) =>
      q.eq("notebookId", sourceNotebookId).eq("status", "completed")
    )
    .collect();

  if (docs.length > MAX_FORK_DOCUMENTS) {
    throw toConvexError(
      new InputValidationError(
        `This notebook has too many sources to copy (max ${MAX_FORK_DOCUMENTS}).`
      )
    );
  }

  const docIdMap = new Map<Id<"documents">, Id<"documents">>();

  for (const d of docs) {
    // Text and chunks are copied by copyForkedDocumentContent, one transaction per batch: a large
    // notebook's chunk embeddings don't fit in this one. Until then the copy shows as processing.
    const newDocId = await ctx.db.insert("documents", {
      userId: forkUserId,
      notebookId: newNotebookId,
      fileName: d.fileName,
      fileType: d.fileType,
      fileSize: d.fileSize,
      fileUrl: d.fileUrl,
      // Shared with the original; deletes keep the file while any document still names it.
      storageId: d.storageId,
      // Drive ids are left behind: refreshing from the owner's Drive isn't the forker's to do.
      contentType: d.contentType,
      status: "processing",
      error: undefined,
      metadata: d.metadata,
      wordCount: d.wordCount,
      estimatedReadingTimeMinutes: d.estimatedReadingTimeMinutes,
      totalPages: d.totalPages,
      totalChunks: d.totalChunks,
      hasCodeBlocks: d.hasCodeBlocks,
      hasMathNotation: d.hasMathNotation,
      hasTables: d.hasTables,
      hasImages: d.hasImages,
      language: d.language,
      documentStructure: d.documentStructure,
      maxHeadingLevel: d.maxHeadingLevel,
      paperRecord: d.paperRecord,
      fulltextStatus: d.fulltextStatus,
      ingestionStatus: d.ingestionStatus,
      fullTextSource: d.fullTextSource,
      sourceGuide: d.sourceGuide,
      createdAt: now,
      updatedAt: now,
    });
    docIdMap.set(d._id, newDocId);
    await ctx.scheduler.runAfter(0, internal.notebooks._forkNotebook.copyForkedDocumentContent, {
      sourceDocumentId: d._id,
      forkDocumentId: newDocId,
      cursor: null,
    });
  }

  const reports = await ctx.db
    .query("reports")
    .withIndex("by_notebook", (q) => q.eq("notebookId", sourceNotebookId))
    .collect();
  for (const r of reports) {
    await ctx.db.insert("reports", {
      userId: forkUserId,
      notebookId: newNotebookId,
      title: r.title,
      content: r.content,
      reportType: r.reportType,
      status: r.status,
      metadata: r.metadata,
      createdAt: now,
      updatedAt: now,
    });
  }

  const flashcards = await ctx.db
    .query("flashcards")
    .withIndex("by_notebook", (q) => q.eq("notebookId", sourceNotebookId))
    .collect();
  for (const r of flashcards) {
    await ctx.db.insert("flashcards", {
      userId: forkUserId,
      notebookId: newNotebookId,
      title: r.title,
      status: r.status,
      cardsData: r.cardsData,
      metadata: r.metadata,
      createdAt: now,
      updatedAt: now,
    });
  }

  const quizzes = await ctx.db
    .query("quizzes")
    .withIndex("by_notebook", (q) => q.eq("notebookId", sourceNotebookId))
    .collect();
  for (const r of quizzes) {
    await ctx.db.insert("quizzes", {
      userId: forkUserId,
      notebookId: newNotebookId,
      title: r.title,
      status: r.status,
      questionsData: r.questionsData,
      metadata: r.metadata,
      createdAt: now,
      updatedAt: now,
    });
  }

  const mindmaps = await ctx.db
    .query("mindmaps")
    .withIndex("by_notebook", (q) => q.eq("notebookId", sourceNotebookId))
    .collect();
  for (const r of mindmaps) {
    await ctx.db.insert("mindmaps", {
      userId: forkUserId,
      notebookId: newNotebookId,
      title: r.title,
      data: r.data,
      status: r.status,
      metadata: remapDocumentIds(r.metadata, "documentIds", docIdMap),
      createdAt: now,
      updatedAt: now,
    });
  }

  const audioOverviews = await ctx.db
    .query("audioOverviews")
    .withIndex("by_notebook", (q) => q.eq("notebookId", sourceNotebookId))
    .collect();
  for (const r of audioOverviews) {
    await ctx.db.insert("audioOverviews", {
      userId: forkUserId,
      notebookId: newNotebookId,
      title: r.title,
      transcript: r.transcript,
      status: r.status,
      audioType: r.audioType,
      audioUrl: r.audioUrl,
      // Same file as the source row, so access checks can find the fork by storage id.
      audioStorageId: r.audioStorageId,
      metadata: withoutSynthesisChunks(r.metadata),
      createdAt: now,
      updatedAt: now,
    });
  }

  const infographics = await ctx.db
    .query("infographics")
    .withIndex("by_notebook", (q) => q.eq("notebookId", sourceNotebookId))
    .collect();
  for (const r of infographics) {
    await ctx.db.insert("infographics", {
      userId: forkUserId,
      notebookId: newNotebookId,
      title: r.title,
      data: remapInfographicData(r.data, docIdMap),
      status: r.status,
      metadata: remapDocumentIds(r.metadata, "sourceDocumentIds", docIdMap),
      createdAt: now,
      updatedAt: now,
    });
  }

  const spreadsheets = await ctx.db
    .query("spreadsheets")
    .withIndex("by_notebook", (q) => q.eq("notebookId", sourceNotebookId))
    .collect();
  for (const r of spreadsheets) {
    await ctx.db.insert("spreadsheets", {
      userId: forkUserId,
      notebookId: newNotebookId,
      title: r.title,
      data: r.data,
      status: r.status,
      metadata: r.metadata,
      createdAt: now,
      updatedAt: now,
    });
  }

  const writtenQuestions = await ctx.db
    .query("writtenQuestions")
    .withIndex("by_notebook", (q) => q.eq("notebookId", sourceNotebookId))
    .collect();
  for (const r of writtenQuestions) {
    await ctx.db.insert("writtenQuestions", {
      userId: forkUserId,
      notebookId: newNotebookId,
      title: r.title,
      status: r.status,
      questionsData: r.questionsData,
      questionType: r.questionType,
      metadata: r.metadata,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Citation rows are global and reused as-is, except a notebook-paper citation: it names the
  // source it came from, so the fork gets a copy naming its own copy of that source (or none).
  const citationIdMap = new Map<Id<"citations">, Id<"citations">>();
  const forkCitationId = async (citationId: Id<"citations">): Promise<Id<"citations">> => {
    const cached = citationIdMap.get(citationId);
    if (cached) return cached;
    let forkedId = citationId;
    const citation = await ctx.db.get(citationId);
    if (citation?.sourceApi === "notebook" && citation.documentId !== undefined) {
      const { _id, _creationTime, documentId, ...fields } = citation;
      forkedId = await ctx.db.insert("citations", {
        ...fields,
        documentId: docIdMap.get(documentId),
      });
    }
    citationIdMap.set(citationId, forkedId);
    return forkedId;
  };
  // Sequential, so a citation listed twice gets one copy.
  const forkCitationIds = async (ids: Id<"citations">[]): Promise<Id<"citations">[]> => {
    const forked: Id<"citations">[] = [];
    for (const id of ids) forked.push(await forkCitationId(id));
    return forked;
  };

  // Literature tables and reports shown in Studio. Chat review outputs stay behind with the chat
  // thread, which a fork doesn't copy.
  const chatOutputs = await getChatLinkedLiteratureArtifactIds(ctx, sourceNotebookId);
  const tableIdMap = new Map<Id<"literatureTables">, Id<"literatureTables">>();
  const literatureTables = await ctx.db
    .query("literatureTables")
    .withIndex("by_notebook", (q) => q.eq("notebookId", sourceNotebookId))
    .collect();
  for (const r of literatureTables) {
    if (r.status !== "completed" || isChatLiteratureTable(r, chatOutputs.tableIds)) continue;
    const paperCitationIds = await forkCitationIds(r.papers.map((p) => p.citationId));
    const newTableId = await ctx.db.insert("literatureTables", {
      title: r.title,
      description: r.description,
      notebookId: newNotebookId,
      userId: forkUserId,
      status: r.status,
      columns: r.columns,
      papers: r.papers.map((p, i) => ({ ...p, citationId: paperCitationIds[i] })),
      createdAt: now,
      updatedAt: now,
    });
    tableIdMap.set(r._id, newTableId);
  }

  const literatureReports = await ctx.db
    .query("literatureReports")
    .withIndex("by_notebook", (q) => q.eq("notebookId", sourceNotebookId))
    .collect();
  for (const r of literatureReports) {
    if (r.status !== "completed" || isChatLiteratureReport(r, chatOutputs.reportIds)) continue;
    await ctx.db.insert("literatureReports", {
      title: r.title,
      notebookId: newNotebookId,
      userId: forkUserId,
      status: r.status,
      content: r.content,
      citationStyle: r.citationStyle,
      sections: r.sections,
      citationIds: await forkCitationIds(r.citationIds),
      tableId: r.tableId ? tableIdMap.get(r.tableId) : undefined,
      createdAt: now,
      updatedAt: now,
    });
  }

  const manualNotes = await ctx.db
    .query("notes")
    .withIndex("by_notebook", (q) => q.eq("notebookId", sourceNotebookId))
    .filter((q) => q.eq(q.field("type"), "manual"))
    .collect();
  for (const n of manualNotes) {
    await ctx.db.insert("notes", {
      userId: forkUserId,
      notebookId: newNotebookId,
      type: "manual",
      title: n.title,
      status: n.status,
      content: n.content,
      messages: undefined,
      messageCount: undefined,
      conversationId: undefined,
      metadata: n.metadata,
      createdAt: now,
      updatedAt: now,
    });
  }

  return newNotebookId;
}
