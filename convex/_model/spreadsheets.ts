import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Database operations for spreadsheets.
 * No query/mutation/action exports — used by convex/spreadsheets.ts and jobs.
 */

export async function getSpreadsheet(
  ctx: QueryCtx,
  spreadsheetId: Id<"spreadsheets">
): Promise<Doc<"spreadsheets"> | null> {
  return await ctx.db.get("spreadsheets", spreadsheetId);
}

export async function listByNotebook(
  ctx: QueryCtx,
  notebookId: Id<"notebooks">,
  userId?: Id<"users">
): Promise<Doc<"spreadsheets">[]> {
  const query = ctx.db
    .query("spreadsheets")
    .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId));

  if (userId) {
    return await ctx.db
      .query("spreadsheets")
      .withIndex("by_notebook_and_user", (q) => q.eq("notebookId", notebookId).eq("userId", userId))
      .order("desc")
      .collect();
  }
  return await query.order("desc").collect();
}

export type SpreadsheetCreate = {
  userId: Id<"users">;
  notebookId: Id<"notebooks">;
  title: string;
  data?: unknown;
  metadata?: unknown;
  status?: string;
};

export async function createSpreadsheet(
  ctx: MutationCtx,
  data: SpreadsheetCreate
): Promise<Id<"spreadsheets">> {
  const now = Date.now();
  return await ctx.db.insert("spreadsheets", {
    userId: data.userId,
    notebookId: data.notebookId,
    title: data.title,
    status: data.status ?? "draft",
    data: data.data ?? {},
    metadata: data.metadata,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Create a spreadsheet and return the created document.
 */
export async function createSpreadsheetAndFetch(
  ctx: MutationCtx,
  data: SpreadsheetCreate
): Promise<Doc<"spreadsheets">> {
  const id = await createSpreadsheet(ctx, data);
  const spreadsheet = await getSpreadsheet(ctx, id);
  if (!spreadsheet) throw new Error("Failed to create spreadsheet");
  return spreadsheet;
}

export type SpreadsheetUpdate = {
  title?: string;
  status?: string;
  data?: unknown;
  metadata?: unknown;
};

export async function updateSpreadsheet(
  ctx: MutationCtx,
  spreadsheetId: Id<"spreadsheets">,
  updates: SpreadsheetUpdate
): Promise<void> {
  await ctx.db.patch("spreadsheets", spreadsheetId, {
    ...updates,
    updatedAt: Date.now(),
  });
}

export async function updateSpreadsheetStatus(
  ctx: MutationCtx,
  spreadsheetId: Id<"spreadsheets">,
  status: string
): Promise<void> {
  await ctx.db.patch("spreadsheets", spreadsheetId, {
    status,
    updatedAt: Date.now(),
  });
}

export async function updateSpreadsheetData(
  ctx: MutationCtx,
  spreadsheetId: Id<"spreadsheets">,
  data: unknown
): Promise<void> {
  await ctx.db.patch("spreadsheets", spreadsheetId, {
    data,
    status: "completed",
    updatedAt: Date.now(),
  });
}

export async function patchSpreadsheet(
  ctx: MutationCtx,
  spreadsheetId: Id<"spreadsheets">,
  patch: Record<string, unknown>
): Promise<void> {
  await ctx.db.patch("spreadsheets", spreadsheetId, {
    ...patch,
    updatedAt: Date.now(),
  });
}

export async function deleteSpreadsheet(
  ctx: MutationCtx,
  spreadsheetId: Id<"spreadsheets">
): Promise<void> {
  await ctx.db.delete("spreadsheets", spreadsheetId);
}
