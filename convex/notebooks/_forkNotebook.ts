import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { InputValidationError } from "../_lib/errors";
import { toConvexError } from "../_lib/serviceErrors";
import {
  getChatLinkedLiteratureArtifactIds,
  isChatLiteratureReport,
  isChatLiteratureTable,
} from "../_model/literatureArtifacts";
import {
  withoutFlashcardProgress,
  withoutQuizProgress,
  withoutWrittenQuestionProgress,
} from "../_model/practiceProgress";
import { deleteDocumentFileIfUnused } from "../documents/internal";

const MAX_FORK_DOCUMENTS = 200;

/**
 * Chunks copied per transaction. A chunk carries a 1536-float embedding (~13 KB), so a batch
 * reads and writes ~1.5 MB, well under the per-mutation limits even with the source's text.
 */
export const FORK_CHUNK_BATCH_SIZE = 100;

/** How long the copy waits for an original that is being reprocessed, per check and in checks. */
const SOURCE_REPROCESS_WAIT_MS = 60_000;
const MAX_SOURCE_REPROCESS_WAITS = 30;

/** The original's file and the fields its processing writes, as the copy takes them. */
function processedContent(source: Doc<"documents">) {
  return {
    storageId: source.storageId,
    fullTextSource: source.fullTextSource,
    extractedMarkdown: source.extractedMarkdown,
    metadata: source.metadata,
    wordCount: source.wordCount,
    estimatedReadingTimeMinutes: source.estimatedReadingTimeMinutes,
    totalPages: source.totalPages,
    totalChunks: source.totalChunks,
    hasCodeBlocks: source.hasCodeBlocks,
    hasMathNotation: source.hasMathNotation,
    hasTables: source.hasTables,
    hasImages: source.hasImages,
    language: source.language,
    documentStructure: source.documentStructure,
    maxHeadingLevel: source.maxHeadingLevel,
  };
}

/** Deletes one batch of the copy's chunks; true when more are left. */
async function deleteCopiedChunksBatch(
  ctx: MutationCtx,
  forkDocumentId: Id<"documents">
): Promise<boolean> {
  const chunks = await ctx.db
    .query("documentChunks")
    .withIndex("by_document", (q) => q.eq("documentId", forkDocumentId))
    .take(FORK_CHUNK_BATCH_SIZE + 1);
  for (const chunk of chunks.slice(0, FORK_CHUNK_BATCH_SIZE)) {
    await ctx.db.delete(chunk._id);
  }
  return chunks.length > FORK_CHUNK_BATCH_SIZE;
}

/** Marks the copy failed and removes whatever part of the original it had copied. */
async function failCopy(ctx: MutationCtx, forkDocumentId: Id<"documents">, error: string) {
  await ctx.db.patch(forkDocumentId, { status: "failed", error, updatedAt: Date.now() });
  if (await deleteCopiedChunksBatch(ctx, forkDocumentId)) {
    await ctx.scheduler.runAfter(0, internal.notebooks._forkNotebook.deleteForkedDocumentChunks, {
      forkDocumentId,
    });
  }
}

/** Finishes removing a failed copy's chunks, a batch per run. */
export const deleteForkedDocumentChunks = internalMutation({
  args: { forkDocumentId: v.id("documents") },
  returns: v.null(),
  handler: async (ctx, { forkDocumentId }) => {
    if (await deleteCopiedChunksBatch(ctx, forkDocumentId)) {
      await ctx.scheduler.runAfter(0, internal.notebooks._forkNotebook.deleteForkedDocumentChunks, {
        forkDocumentId,
      });
    }
    return null;
  },
});

/**
 * Copies one forked source's text and chunks from the original, a batch per run, rescheduling
 * itself until done; then marks the copy completed.
 *
 * `sourceUpdatedAt` is the version of the original being copied. If the original has changed
 * since (it was reprocessed, so its chunks were rebuilt), the copy drops what it has and starts
 * over; null means it must start over once the original is completed again. While the original
 * is being reprocessed the copy waits, then fails after MAX_SOURCE_REPROCESS_WAITS checks.
 * Stops quietly if the copy or its notebook has been deleted meanwhile.
 */
export const copyForkedDocumentContent = internalMutation({
  args: {
    sourceDocumentId: v.id("documents"),
    forkDocumentId: v.id("documents"),
    cursor: v.union(v.string(), v.null()),
    sourceUpdatedAt: v.union(v.number(), v.null()),
    waits: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { sourceDocumentId, forkDocumentId, cursor, sourceUpdatedAt } = args;
    const fork = await ctx.db.get(forkDocumentId);
    if (!fork) return null;
    // Deleting a notebook can leave its document rows behind; nothing reads them, so stop.
    if (!(await ctx.db.get(fork.notebookId))) return null;

    const source = await ctx.db.get(sourceDocumentId);
    if (!source) {
      // Without the original there is nothing left to copy; don't leave the copy spinning.
      await failCopy(
        ctx,
        forkDocumentId,
        "The original source was deleted before it finished copying."
      );
      return null;
    }

    const continueWith = async (
      delayMs: number,
      next: Pick<typeof args, "cursor" | "sourceUpdatedAt" | "waits">
    ) => {
      await ctx.scheduler.runAfter(
        delayMs,
        internal.notebooks._forkNotebook.copyForkedDocumentContent,
        { sourceDocumentId, forkDocumentId, ...next }
      );
    };

    if (source.status !== "completed") {
      const waits = args.waits ?? 0;
      if (waits >= MAX_SOURCE_REPROCESS_WAITS) {
        await failCopy(
          ctx,
          forkDocumentId,
          "The original source was being reprocessed and didn't finish in time to copy."
        );
        return null;
      }
      await continueWith(SOURCE_REPROCESS_WAIT_MS, {
        cursor: null,
        sourceUpdatedAt: null,
        waits: waits + 1,
      });
      return null;
    }

    if (source.updatedAt !== sourceUpdatedAt) {
      // The original changed under the copy: drop the chunks copied so far, then start over.
      if (await deleteCopiedChunksBatch(ctx, forkDocumentId)) {
        await continueWith(0, { cursor, sourceUpdatedAt, waits: 0 });
      } else {
        await continueWith(0, { cursor: null, sourceUpdatedAt: source.updatedAt, waits: 0 });
      }
      return null;
    }

    if (cursor === null) {
      const content = processedContent(source);
      const previousStorageId = fork.storageId;
      await ctx.db.patch(forkDocumentId, content);
      // A new upload on the original replaced its file; the copy follows it, so drop the old
      // file unless something else still uses it.
      if (previousStorageId && previousStorageId !== content.storageId) {
        await deleteDocumentFileIfUnused(ctx, previousStorageId, [forkDocumentId]);
      }
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
      await continueWith(0, { cursor: batch.continueCursor, sourceUpdatedAt, waits: 0 });
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
      sourceUpdatedAt: d.updatedAt,
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
  // Practice progress on the source rows is the owner's; the forker starts fresh.
  for (const r of flashcards.map(withoutFlashcardProgress)) {
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
  for (const r of quizzes.map(withoutQuizProgress)) {
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
  for (const r of writtenQuestions.map(withoutWrittenQuestionProgress)) {
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
