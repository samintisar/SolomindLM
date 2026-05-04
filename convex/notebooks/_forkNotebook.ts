import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

const MAX_FORK_DOCUMENTS = 200;
const MAX_FORK_CHUNKS = 10_000;

/**
 * Deep-copies a notebook into forkUserId's account. Single-transaction helper (not an API).
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
    throw new Error(`Notebook has too many sources to fork at once (max ${MAX_FORK_DOCUMENTS}).`);
  }

  const docIdMap = new Map<Id<"documents">, Id<"documents">>();

  for (const d of docs) {
    const newStorageId = d.storageId;

    const newDocId = await ctx.db.insert("documents", {
      userId: forkUserId,
      notebookId: newNotebookId,
      fileName: d.fileName,
      fileType: d.fileType,
      fileSize: d.fileSize,
      fileUrl: d.fileUrl,
      storageId: newStorageId,
      contentType: d.contentType,
      status: d.status,
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
      extractedMarkdown: d.extractedMarkdown,
      createdAt: now,
      updatedAt: now,
    });
    docIdMap.set(d._id, newDocId);
  }

  const chunks = await ctx.db
    .query("documentChunks")
    .withIndex("by_notebook", (q) => q.eq("notebookId", sourceNotebookId))
    .collect();

  if (chunks.length > MAX_FORK_CHUNKS) {
    throw new Error(`Notebook is too large to fork (max ${MAX_FORK_CHUNKS} text chunks).`);
  }

  for (const c of chunks) {
    const newDocId = docIdMap.get(c.documentId);
    if (!newDocId) continue;

    await ctx.db.insert("documentChunks", {
      documentId: newDocId,
      userId: forkUserId,
      notebookId: newNotebookId,
      content: c.content,
      chunkIndex: c.chunkIndex,
      embedding: c.embedding,
      metadata: c.metadata,
      totalChunks: c.totalChunks,
      relativePosition: c.relativePosition,
      chunkLengthChars: c.chunkLengthChars,
      wordCount: c.wordCount,
      sentenceCount: c.sentenceCount,
      pageNumber: c.pageNumber,
      sectionTitle: c.sectionTitle,
      sectionLevel: c.sectionLevel,
      headingPath: c.headingPath,
      previousChunkPreview: c.previousChunkPreview,
      nextChunkPreview: c.nextChunkPreview,
      hasCodeBlock: c.hasCodeBlock,
      hasMathNotation: c.hasMathNotation,
      hasTable: c.hasTable,
      hasBulletList: c.hasBulletList,
      hasNumberedList: c.hasNumberedList,
      createdAt: now,
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
      metadata: r.metadata,
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
      metadata: r.metadata,
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
      data: r.data,
      status: r.status,
      metadata: r.metadata,
      createdAt: now,
      updatedAt: now,
    });
  }

  const slides = await ctx.db
    .query("slides")
    .withIndex("by_notebook", (q) => q.eq("notebookId", sourceNotebookId))
    .collect();
  for (const r of slides) {
    await ctx.db.insert("slides", {
      userId: forkUserId,
      notebookId: newNotebookId,
      title: r.title,
      data: r.data,
      status: r.status,
      slideCount: r.slideCount,
      metadata: r.metadata,
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
