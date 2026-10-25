/**
 * `studioItems`: one light row per studio output and note, read by the Studio panel list (#600).
 *
 * The outputs carry their full payloads (report content, cards, questions, transcripts, map
 * results), and jobs patch them at every phase. Listing them directly re-read every output in the
 * notebook on each patch. Each item's list row is kept here instead, written by the triggers in
 * `convex/functions.ts` whenever an output is inserted, patched or deleted.
 *
 * Invariant: a notebook whose `studioItemIndexes` row is "done" has a row for every output. A
 * notebook's first write marks it "indexing" and schedules `indexNotebookPage` over the outputs it
 * already had (notebooks from before the index are also filled in by
 * `_migration/backfillStudioItems`). Until it is "done", the list reads the output tables.
 */

import type { Triggers } from "convex-helpers/server/triggers";
import { internal } from "../_generated/api";
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

/** Documents read per indexing mutation: outputs can be large, so a page stays small. */
export const INDEX_PAGE_SIZE = 16;

export async function getStudioIndexState(
  ctx: QueryCtx,
  notebookId: Id<"notebooks">
): Promise<Doc<"studioItemIndexes"> | null> {
  return await ctx.db
    .query("studioItemIndexes")
    .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
    .unique();
}

/** True once every output in the notebook has a `studioItems` row. */
export async function isNotebookIndexed(
  ctx: QueryCtx,
  notebookId: Id<"notebooks">
): Promise<boolean> {
  return (await getStudioIndexState(ctx, notebookId))?.status === "done";
}

/**
 * Marks the notebook as indexing and schedules `indexPage` over its outputs. From here on every
 * write keeps its own row, so the notebook is complete once the scheduled pages finish.
 */
export async function startIndexing(ctx: MutationCtx, notebookId: Id<"notebooks">) {
  const state = await getStudioIndexState(ctx, notebookId);
  if (state?.status === "done") return;
  if (state) {
    await ctx.db.patch("studioItemIndexes", state._id, { updatedAt: Date.now() });
  } else {
    await ctx.db.insert("studioItemIndexes", {
      notebookId,
      status: "indexing",
      updatedAt: Date.now(),
    });
  }
  await ctx.scheduler.runAfter(0, internal._migration.backfillStudioItems.indexPage, {
    notebookId,
    tableIndex: 0,
    after: null,
  });
}

/** Where indexing resumes: a table, and the `_creationTime` of the last output indexed in it. */
export type IndexPosition = { tableIndex: number; after: number | null };

/**
 * Indexes up to `INDEX_PAGE_SIZE` outputs from `start`, walking each table's `by_notebook` index
 * in creation order. Returns where to continue, or null once every table is done (and the notebook
 * is marked "done").
 */
export async function indexNotebookPage(
  ctx: MutationCtx,
  notebookId: Id<"notebooks">,
  start: IndexPosition
): Promise<IndexPosition | null> {
  let budget = INDEX_PAGE_SIZE;
  let { tableIndex, after } = start;
  while (tableIndex < STUDIO_ITEM_TABLES.length) {
    if (budget === 0) return { tableIndex, after };
    const table = STUDIO_ITEM_TABLES[tableIndex];
    const docs = await ctx.db
      .query(table)
      .withIndex("by_notebook", (q) => {
        const inNotebook = q.eq("notebookId", notebookId);
        return after === null ? inNotebook : inNotebook.gt("_creationTime", after);
      })
      .take(budget);
    for (const doc of docs) await upsertStudioItem(ctx, table, doc);
    if (docs.length < budget) {
      tableIndex += 1;
      after = null;
    } else {
      after = docs[docs.length - 1]._creationTime;
    }
    budget -= docs.length;
  }

  const state = await getStudioIndexState(ctx, notebookId);
  const done = { status: "done" as const, updatedAt: Date.now() };
  if (state) {
    await ctx.db.patch("studioItemIndexes", state._id, done);
  } else {
    await ctx.db.insert("studioItemIndexes", { notebookId, ...done });
  }
  return null;
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

/**
 * Keeps `studioItems` in step with every write to a studio output or note table. A write only
 * touches its own row; a notebook's first write also starts indexing the rest in the background,
 * so a job patch in a large notebook never reads the notebook's other outputs.
 */
export function registerStudioItemTriggers(triggers: Triggers<DataModel>) {
  for (const table of STUDIO_ITEM_TABLES) {
    triggers.register(table, async (ctx, change) => {
      if (change.operation === "delete") {
        await deleteStudioItem(ctx, change.id);
        return;
      }
      const doc = change.newDoc as StudioItemDoc;
      if (!(await getStudioIndexState(ctx, doc.notebookId))) {
        await startIndexing(ctx, doc.notebookId);
      }
      await upsertStudioItem(ctx, table, doc);
    });
  }
}
