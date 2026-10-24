/**
 * `studioItems`: one light row per studio output and note, read by the Studio panel list (#600).
 *
 * The outputs carry their full payloads (report content, cards, questions, transcripts, map
 * results), and jobs patch them at every phase. Listing them directly re-read every output in the
 * notebook on each patch. Each item's list row is kept here instead, written by the triggers in
 * `convex/functions.ts` whenever an output is inserted, patched or deleted.
 *
 * Invariant: a notebook with at least one `studioItems` row has a row for every output. The first
 * write to a notebook that has none indexes all of its outputs (`indexNotebook`), so notebooks from
 * before the index are filled in on first use or by `_migration/backfillStudioItems`. A notebook
 * without rows is listed from the output tables, as before.
 */

import type { Triggers } from "convex-helpers/server/triggers";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { summarizeListRow } from "../notes/listSummary";

export const STUDIO_ITEM_TABLES = [
  "reports",
  "flashcards",
  "quizzes",
  "mindmaps",
  "audioOverviews",
  "infographics",
  "spreadsheets",
  "writtenQuestions",
  "notes",
] as const;

export type StudioItemTable = (typeof STUDIO_ITEM_TABLES)[number];

/** The `_type` tag the notes queries and the web client use for each table. */
export const STUDIO_ITEM_TYPE_TAGS: Record<StudioItemTable, string> = {
  reports: "report",
  flashcards: "flashcard",
  quizzes: "quiz",
  mindmaps: "mindmap",
  audioOverviews: "audioOverview",
  infographics: "infographic",
  spreadsheets: "spreadsheet",
  writtenQuestions: "writtenQuestions",
  notes: "note",
};

/**
 * Job state that studio jobs keep in `metadata` while they run: per-chunk map results and the
 * audio script and synthesis plan. The list only needs how many map tasks are done.
 */
const HEAVY_METADATA_KEYS = ["mapResults", "synthesisInput", "synthesis"] as const;

function summarizeMetadata(metadata: unknown): unknown {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return metadata;
  const m = metadata as Record<string, unknown>;
  if (!HEAVY_METADATA_KEYS.some((key) => key in m)) return metadata;
  const light: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(m)) {
    if (!(HEAVY_METADATA_KEYS as readonly string[]).includes(key)) light[key] = value;
  }
  const mapResults = m.mapResults;
  if (
    typeof m.completedMapTasks !== "number" &&
    mapResults &&
    typeof mapResults === "object" &&
    !Array.isArray(mapResults)
  ) {
    light.completedMapTasks = Object.keys(mapResults).length;
  }
  return light;
}

type StudioItemDoc = Doc<StudioItemTable>;

/** The list row for one output: `_type`-tagged, heavy payloads and job state removed. */
export function buildStudioListRow(
  table: StudioItemTable,
  doc: StudioItemDoc
): Record<string, unknown> {
  const tagged = { ...doc, _type: STUDIO_ITEM_TYPE_TAGS[table] } as Record<string, unknown> & {
    _type: string;
  };
  const row = summarizeListRow(tagged) as Record<string, unknown>;
  if ("metadata" in row) row.metadata = summarizeMetadata(row.metadata);
  return row;
}

function studioItemFields(table: StudioItemTable, doc: StudioItemDoc) {
  const privateToUserId =
    table === "notes" && (doc as Doc<"notes">).type === "chat"
      ? ((doc as Doc<"notes">).userId as string)
      : undefined;
  return {
    notebookId: doc.notebookId,
    itemType: table,
    itemId: doc._id as string,
    privateToUserId,
    updatedAt: doc.updatedAt,
    row: buildStudioListRow(table, doc),
  };
}

export async function notebookHasStudioItems(
  ctx: QueryCtx,
  notebookId: Id<"notebooks">
): Promise<boolean> {
  const first = await ctx.db
    .query("studioItems")
    .withIndex("by_notebook_and_updatedAt", (q) => q.eq("notebookId", notebookId))
    .first();
  return first !== null;
}

/** Writes a `studioItems` row for every output in the notebook that lacks one. */
export async function indexNotebook(ctx: MutationCtx, notebookId: Id<"notebooks">) {
  for (const table of STUDIO_ITEM_TABLES) {
    for await (const doc of ctx.db
      .query(table)
      .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))) {
      await upsertStudioItem(ctx, table, doc);
    }
  }
}

async function upsertStudioItem(ctx: MutationCtx, table: StudioItemTable, doc: StudioItemDoc) {
  const fields = studioItemFields(table, doc);
  const existing = await ctx.db
    .query("studioItems")
    .withIndex("by_item", (q) => q.eq("itemId", fields.itemId))
    .unique();
  if (existing) {
    await ctx.db.replace("studioItems", existing._id, fields);
  } else {
    await ctx.db.insert("studioItems", fields);
  }
}

async function deleteStudioItem(ctx: MutationCtx, itemId: string) {
  const existing = await ctx.db
    .query("studioItems")
    .withIndex("by_item", (q) => q.eq("itemId", itemId))
    .unique();
  if (existing) await ctx.db.delete("studioItems", existing._id);
}

/** Keeps `studioItems` in step with every write to a studio output or note table. */
export function registerStudioItemTriggers(triggers: Triggers<DataModel>) {
  for (const table of STUDIO_ITEM_TABLES) {
    triggers.register(table, async (ctx, change) => {
      if (change.operation === "delete") {
        await deleteStudioItem(ctx, change.id);
        return;
      }
      const doc = change.newDoc as StudioItemDoc;
      if (!(await notebookHasStudioItems(ctx, doc.notebookId))) {
        // First indexed write in this notebook: index all of it, this output included.
        await indexNotebook(ctx, doc.notebookId);
        return;
      }
      await upsertStudioItem(ctx, table, doc);
    });
  }
}
