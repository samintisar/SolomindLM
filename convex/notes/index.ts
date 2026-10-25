import { v } from "convex/values";
import type { Doc, Id, TableNames } from "../_generated/dataModel";
import { type QueryCtx, query } from "../_generated/server";
import { assertCanReadNotebook, type NotebookAccessRole } from "../_lib/notebookAccess";
import * as NotesModel from "../_model/notes";
import { forViewer } from "../_model/practiceProgress";
import {
  buildStudioListRow,
  isNotebookIndexed,
  STUDIO_ITEM_TABLES,
  type StudioItemTable,
} from "../_model/studioItems";
import { listViewerProgressByItem, viewerPracticeRow } from "../_model/studioProgress";
import { getAuthUserId } from "../auth";

/** Most rows the Studio panel list returns; the newest come first. */
const STUDIO_LIST_LIMIT = 500;

type ListRow = Record<string, unknown> & { _type: string; _id: string; updatedAt: number };

/**
 * Every studio output and note in a notebook, newest first, without heavy payloads (full content
 * loads via `get`). Rows come from `studioItems` (#600), so a running job's patches re-read small
 * rows, not every output. A notebook not fully indexed yet is listed from the output tables.
 */
export const list = query({
  args: {
    notebookId: v.id("notebooks"),
    // Optional: Filter by table name (e.g. "reports", "notes")
    types: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    let access: NotebookAccessRole;
    try {
      ({ access } = await assertCanReadNotebook(ctx, args.notebookId, userId));
    } catch {
      return [];
    }

    const wanted = (table: StudioItemTable) => !args.types || args.types.includes(table);
    const rows: ListRow[] = (await isNotebookIndexed(ctx, args.notebookId))
      ? (
          await ctx.db
            .query("studioItems")
            .withIndex("by_notebook_and_updatedAt", (q) => q.eq("notebookId", args.notebookId))
            .order("desc")
            .take(STUDIO_LIST_LIMIT)
        )
          .filter(
            (item) =>
              wanted(item.itemType) &&
              (item.privateToUserId === undefined || item.privateToUserId === userId)
          )
          .map((item) => item.row as ListRow)
      : await listFromOutputTables(ctx, args.notebookId, userId, wanted);

    // Practice progress on a shared row is the owner's; a viewer sees their own instead.
    if (access !== "viewer") return rows;
    const viewerProgress = await listViewerProgressByItem(ctx, userId, args.notebookId);
    return rows.map((row) => forViewer(row._type, row, viewerProgress.get(row._id)));
  },
});

/** The list for a notebook not fully indexed yet, read from the output tables. */
async function listFromOutputTables(
  ctx: QueryCtx,
  notebookId: Id<"notebooks">,
  userId: Id<"users">,
  wanted: (table: StudioItemTable) => boolean
): Promise<ListRow[]> {
  const results = await Promise.all(
    STUDIO_ITEM_TABLES.filter(wanted).map(async (table) => {
      const docs: Doc<StudioItemTable>[] =
        table === "notes"
          ? await NotesModel.listByNotebookShared(ctx, notebookId, userId)
          : await ctx.db
              .query(table)
              .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
              .order("desc")
              .take(STUDIO_LIST_LIMIT);
      return docs.map((doc) => buildStudioListRow(table, doc) as ListRow);
    })
  );
  return results
    .flat()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, STUDIO_LIST_LIMIT);
}

/**
 * Get a single note by type and ID
 */
export const get = query({
  args: {
    type: v.string(),
    id: v.union(
      v.id("reports"),
      v.id("flashcards"),
      v.id("quizzes"),
      v.id("mindmaps"),
      v.id("audioOverviews"),
      v.id("infographics"),
      v.id("spreadsheets"),
      v.id("writtenQuestions"),
      v.id("notes")
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const tableMap: Record<string, TableNames> = {
      report: "reports",
      flashcard: "flashcards",
      quiz: "quizzes",
      mindmap: "mindmaps",
      audioOverview: "audioOverviews",
      infographic: "infographics",
      spreadsheet: "spreadsheets",
      writtenQuestions: "writtenQuestions",
      note: "notes",
    };

    const tableName = tableMap[args.type];
    if (!tableName) {
      return null;
    }

    // The id must belong to the table `type` names: the progress strip below is chosen by type,
    // so a mismatched pair would strip the wrong fields.
    const id = ctx.db.normalizeId(tableName, args.id);
    if (!id) return null;
    const note = await ctx.db.get(id);
    if (!note) return null;

    if (!("notebookId" in note)) {
      return null;
    }

    let access: NotebookAccessRole;
    try {
      if (!note.notebookId) return null;
      ({ access } = await assertCanReadNotebook(ctx, note.notebookId, userId));
    } catch {
      return null;
    }

    if (tableName === "notes" && "type" in note) {
      if (note.type === "chat" && note.userId !== userId) {
        return null;
      }
    }

    const visible =
      access === "viewer" ? await viewerPracticeRow(ctx, tableName, note, userId) : note;
    return { ...visible, _type: args.type };
  },
});
