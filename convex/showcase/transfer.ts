/**
 * Copies a finished showcase notebook from one deployment to another (dev → prod) without
 * regenerating anything: plan in docs/superpowers/plans/2026-10-20-showcase-copy-to-prod.md.
 * These are the database halves; `transferActions.ts` moves the bundle and the stored files.
 * Internal only. The copy holds what a fork copies (`notebooks/_forkNotebook.ts`): sources with
 * their chunks and embeddings, finished Studio items, and the Studio literature tables and reports.
 */
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery } from "../_generated/server";
import {
  getChatLinkedLiteratureArtifactIds,
  isChatLiteratureReport,
  isChatLiteratureTable,
} from "../_model/literatureArtifacts";
import * as Notebooks from "../_model/notebooks";
import {
  withoutFlashcardProgress,
  withoutQuizProgress,
  withoutWrittenQuestionProgress,
} from "../_model/practiceProgress";
import { ownerByEmail } from "./db";
import { SHOWCASE_FOLDER_NAME, SHOWCASE_NOTEBOOKS } from "./manifest";

/** Studio tables copied as they are (after remapping), in insert order. */
export const STUDIO_TABLES = [
  "reports",
  "flashcards",
  "quizzes",
  "writtenQuestions",
  "mindmaps",
  "audioOverviews",
  "infographics",
  "spreadsheets",
] as const;
type StudioTable = (typeof STUDIO_TABLES)[number];

const insertableTable = v.union(
  v.literal("documents"),
  v.literal("documentChunks"),
  v.literal("citations"),
  v.literal("literatureTables"),
  v.literal("literatureReports"),
  ...STUDIO_TABLES.map((t) => v.literal(t))
);

/** Rows per notebook read in one query: showcase notebooks hold a few dozen. */
const MAX_ROWS = 500;
const CHUNK_PAGE = 100;

function specBySlug(slug: string) {
  const spec = SHOWCASE_NOTEBOOKS.find((n) => n.slug === slug);
  if (!spec) throw new Error(`No showcase notebook "${slug}"`);
  return spec;
}

/** An unfinished overview lists its chunk MP3s here; the copy has no job of its own. */
function withoutSynthesisChunks<T extends { metadata?: unknown }>(row: T): T {
  const metadata = row.metadata as Record<string, unknown> | undefined;
  if (metadata?.synthesis === undefined) return row;
  const { synthesis: _synthesis, ...rest } = metadata;
  return { ...row, metadata: rest };
}

function withoutProgress(table: StudioTable, row: Doc<StudioTable>): Doc<StudioTable> {
  switch (table) {
    case "flashcards":
      return withoutFlashcardProgress(row as Doc<"flashcards">);
    case "quizzes":
      return withoutQuizProgress(row as Doc<"quizzes">);
    case "writtenQuestions":
      return withoutWrittenQuestionProgress(row as Doc<"writtenQuestions">);
    case "audioOverviews":
      return withoutSynthesisChunks(row as Doc<"audioOverviews">);
    default:
      return row;
  }
}

/**
 * Everything but the chunks of one finished showcase notebook, owned by `ownerEmail`, in the
 * "Showcase" folder. Only completed rows are exported.
 */
export const exportNotebookRows = internalQuery({
  args: { ownerEmail: v.string(), slug: v.string() },
  handler: async (ctx, args) => {
    const spec = specBySlug(args.slug);
    const owner = await ownerByEmail(ctx.db, args.ownerEmail);
    let notebook: Doc<"notebooks"> | null = null;
    for await (const folder of ctx.db
      .query("folders")
      .withIndex("by_user", (q) => q.eq("userId", owner._id))) {
      if (folder.name !== SHOWCASE_FOLDER_NAME) continue;
      for await (const n of ctx.db
        .query("notebooks")
        .withIndex("by_folder", (q) => q.eq("folderId", folder._id))) {
        if (n.userId === owner._id && n.title === spec.title) notebook = n;
      }
    }
    if (!notebook) throw new Error(`"${spec.title}" isn't in ${args.ownerEmail}'s Showcase folder`);
    const notebookId = notebook._id;

    const documents = (
      await ctx.db
        .query("documents")
        .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
        .take(MAX_ROWS)
    ).filter((d) => d.status === "completed");

    const studio: Record<string, Doc<StudioTable>[]> = {};
    for (const table of STUDIO_TABLES) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
        .take(MAX_ROWS);
      studio[table] = rows
        .filter((r) => r.userId === owner._id && r.status === "completed")
        .map((r) => withoutProgress(table, r));
    }

    // Chat review outputs stay with the chat thread, which isn't copied (as in a fork).
    const chatOutputs = await getChatLinkedLiteratureArtifactIds(ctx, notebookId);
    const literatureTables = (
      await ctx.db
        .query("literatureTables")
        .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
        .take(MAX_ROWS)
    ).filter((t) => t.status === "completed" && !isChatLiteratureTable(t, chatOutputs.tableIds));
    const literatureReports = (
      await ctx.db
        .query("literatureReports")
        .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
        .take(MAX_ROWS)
    ).filter((r) => r.status === "completed" && !isChatLiteratureReport(r, chatOutputs.reportIds));

    // Citation rows are global on the source; the target gets its own copies.
    const citationIds = new Set<Id<"citations">>();
    for (const t of literatureTables) for (const p of t.papers) citationIds.add(p.citationId);
    for (const r of literatureReports) for (const id of r.citationIds) citationIds.add(id);
    const citations: Doc<"citations">[] = [];
    for (const id of citationIds) {
      const citation = await ctx.db.get(id);
      if (citation) citations.push(citation);
    }

    return {
      slug: args.slug,
      sourceUserId: owner._id,
      notebook: {
        _id: notebook._id,
        title: notebook.title,
        icon: notebook.icon,
        coverColor: notebook.coverColor,
        chatSettings: notebook.chatSettings,
      },
      documents,
      citations,
      literatureTables,
      literatureReports,
      studio,
    };
  },
});

/** One page of a document's chunks, embeddings included. */
export const exportChunksPage = internalQuery({
  args: { documentId: v.id("documents"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("documentChunks")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .paginate({ cursor: args.cursor, numItems: CHUNK_PAGE });
  },
});

/**
 * Creates the target notebook in `folderName` (default "Showcase") of the owner's account, with
 * the source's title, icon, cover and chat settings. Refuses if that folder already holds a
 * notebook with this title, so a notebook is never copied twice.
 */
export const beginImport = internalMutation({
  args: {
    ownerEmail: v.string(),
    title: v.string(),
    icon: v.optional(v.string()),
    coverColor: v.optional(v.string()),
    chatSettings: v.optional(v.any()),
    folderName: v.optional(v.string()),
  },
  returns: v.object({ notebookId: v.id("notebooks"), userId: v.id("users") }),
  handler: async (ctx, args) => {
    const owner = await ownerByEmail(ctx.db, args.ownerEmail);
    const folderName = args.folderName ?? SHOWCASE_FOLDER_NAME;
    let folderId: Id<"folders"> | null = null;
    for await (const folder of ctx.db
      .query("folders")
      .withIndex("by_user", (q) => q.eq("userId", owner._id))) {
      if (folder.name === folderName) folderId = folder._id;
    }
    if (folderId) {
      const fid = folderId;
      for await (const n of ctx.db
        .query("notebooks")
        .withIndex("by_folder", (q) => q.eq("folderId", fid))) {
        if (n.userId === owner._id && n.title === args.title) {
          throw new Error(
            `"${args.title}" is already in ${args.ownerEmail}'s ${folderName} folder`
          );
        }
      }
    } else {
      const now = Date.now();
      folderId = await ctx.db.insert("folders", {
        userId: owner._id,
        name: folderName,
        icon: "Folder",
        createdAt: now,
        updatedAt: now,
      });
    }
    const notebookId = await Notebooks.createNotebook(ctx, {
      userId: owner._id,
      title: args.title,
      icon: args.icon,
      coverColor: args.coverColor,
      folderId,
    });
    if (args.chatSettings) {
      await Notebooks.updateNotebook(ctx, notebookId, { chatSettings: args.chatSettings });
    }
    return { notebookId, userId: owner._id };
  },
});

/**
 * Undoes part of a failed import: deletes rows it inserted into `table` (only rows of
 * `notebookId`; citations are global and named by the caller), or with `table` omitted, the
 * notebook itself. Notebook deletion doesn't cascade (`account/_purge.ts`), so rows go first.
 */
export const abortImport = internalMutation({
  args: {
    notebookId: v.id("notebooks"),
    table: v.optional(insertableTable),
    ids: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!args.table) {
      if (await ctx.db.get(args.notebookId)) {
        await Notebooks.removeNotebookWithRelated(ctx, args.notebookId);
      }
      return null;
    }
    for (const id of args.ids ?? []) {
      const row = (await ctx.db.get(id as Id<typeof args.table>)) as Record<string, unknown> | null;
      if (!row) continue;
      if (args.table !== "citations" && row.notebookId !== args.notebookId) continue;
      await ctx.db.delete(id as Id<typeof args.table>);
      if (args.table === "documents") {
        await Notebooks.adjustNotebookSourceCount(ctx, args.notebookId, -1);
      }
    }
    return null;
  },
});

/**
 * Inserts already-remapped rows into one of the copied tables and returns their new ids, in
 * order. Every row must belong to `notebookId` and its owner (citations are global and exempt).
 */
export const insertRows = internalMutation({
  args: {
    notebookId: v.id("notebooks"),
    table: insertableTable,
    rows: v.array(v.any()),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const notebook = await ctx.db.get(args.notebookId);
    if (!notebook) throw new Error("The target notebook doesn't exist");
    const ids: string[] = [];
    for (const row of args.rows as Array<Record<string, unknown>>) {
      if (args.table !== "citations") {
        if (row.notebookId !== args.notebookId || row.userId !== notebook.userId) {
          throw new Error(`A ${args.table} row doesn't belong to the target notebook`);
        }
      }
      ids.push(await ctx.db.insert(args.table, row as never));
    }
    if (args.table === "documents") {
      await Notebooks.adjustNotebookSourceCount(ctx, args.notebookId, ids.length);
    }
    return ids;
  },
});
