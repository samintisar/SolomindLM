import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Database operations for notebooks.
 * No query/mutation/action exports — used by convex/notebooks.ts and jobs.
 */

export async function getNotebook(
  ctx: QueryCtx,
  notebookId: Id<"notebooks">
): Promise<Doc<"notebooks"> | null> {
  return await ctx.db.get("notebooks", notebookId);
}

export async function getUserNotebooks(
  ctx: QueryCtx,
  userId: Id<"users">
): Promise<Doc<"notebooks">[]> {
  return await ctx.db
    .query("notebooks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .collect();
}

/**
 * Counts a notebook's documents by reading every row, extracted text included. Only for writes and
 * for notebooks without a stored count; reads go through `getNotebookSourceCount` (#589).
 */
export async function getDocumentCountByNotebook(
  ctx: QueryCtx,
  notebookId: Id<"notebooks">
): Promise<number> {
  const documents = await ctx.db
    .query("documents")
    .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
    .collect();
  return documents.length;
}

/**
 * The notebook's source count. It is stored on the notebook, so the notebook list doesn't read
 * every document (with its extracted text) of every notebook each time it re-runs (#589).
 * Notebooks written before the count existed are counted until the backfill sets it.
 */
export async function getNotebookSourceCount(
  ctx: QueryCtx,
  notebook: Doc<"notebooks">
): Promise<number> {
  return notebook.sourceCount ?? (await getDocumentCountByNotebook(ctx, notebook._id));
}

/**
 * Keeps the stored source count in step after documents are added (`delta` > 0) or deleted.
 * Call it in the same mutation as the insert or delete. A notebook without a stored count is
 * left for the backfill, since it is counted on read.
 */
export async function adjustNotebookSourceCount(
  ctx: MutationCtx,
  notebookId: Id<"notebooks">,
  delta: number
): Promise<void> {
  const notebook = await ctx.db.get("notebooks", notebookId);
  if (!notebook || notebook.sourceCount === undefined) return;
  await ctx.db.patch("notebooks", notebookId, {
    sourceCount: Math.max(0, notebook.sourceCount + delta),
  });
}

export type NotebookCreate = {
  userId: Id<"users">;
  title: string;
  coverColor?: string;
  icon?: string;
  folderId?: Id<"folders">;
};

export async function createNotebook(
  ctx: MutationCtx,
  data: NotebookCreate
): Promise<Id<"notebooks">> {
  const now = Date.now();
  return await ctx.db.insert("notebooks", {
    userId: data.userId,
    title: data.title.trim(),
    coverColor: data.coverColor,
    icon: data.icon,
    folderId: data.folderId,
    sourceCount: 0,
    createdAt: now,
    updatedAt: now,
  });
}

export type ChatSettings = {
  instructionMode: "default" | "learningGuide" | "custom";
  customInstructions?: string;
  responseLength: "default" | "longer" | "shorter";
  smartModel?: string;
};

/** Max character count for custom instructions */
export const CUSTOM_INSTRUCTIONS_MAX_LENGTH = 10000;

export type NotebookUpdate = {
  title?: string;
  coverColor?: string;
  icon?: string;
  folderId?: Id<"folders">;
  chatSettings?: ChatSettings;
};

/**
 * Normalize chatSettings: if instructionMode is "custom" but customInstructions
 * is empty/whitespace-only, fall back to "default" mode.
 * Trims customInstructions and caps at CUSTOM_INSTRUCTIONS_MAX_LENGTH.
 */
export function normalizeChatSettings(
  settings: ChatSettings | undefined
): ChatSettings | undefined {
  if (!settings) return undefined;
  const { instructionMode, customInstructions, responseLength, smartModel } = settings;

  // Normalize: custom with empty text → default
  if (instructionMode === "custom") {
    const trimmed = customInstructions?.trim();
    if (!trimmed) {
      return responseLength === "default" && !smartModel
        ? undefined
        : { instructionMode: "default", responseLength, ...(smartModel && { smartModel }) };
    }
    return {
      instructionMode: "custom",
      customInstructions: trimmed.slice(0, CUSTOM_INSTRUCTIONS_MAX_LENGTH),
      responseLength,
      ...(smartModel && { smartModel }),
    };
  }

  // default or learningGuide with default responseLength → whole setting unnecessary
  if (instructionMode === "default" && responseLength === "default" && !smartModel) {
    return undefined;
  }

  return { instructionMode, responseLength, ...(smartModel && { smartModel }) };
}

export async function updateNotebook(
  ctx: MutationCtx,
  notebookId: Id<"notebooks">,
  updates: NotebookUpdate
): Promise<void> {
  const updateData: Record<string, unknown> = {
    ...updates,
    updatedAt: Date.now(),
  };
  if (updates.title !== undefined) {
    updateData.title = updates.title.trim();
  }
  if (updates.chatSettings !== undefined) {
    updateData.chatSettings = normalizeChatSettings(updates.chatSettings);
  }
  await ctx.db.patch("notebooks", notebookId, updateData);
}

export async function deleteNotebook(ctx: MutationCtx, notebookId: Id<"notebooks">): Promise<void> {
  await ctx.db.delete("notebooks", notebookId);
}

/**
 * Remove share links, collaborating members, then the notebook row (same as public `notebooks.remove`).
 * Does not delete documents, conversations, or other per-notebook content (matches current product behavior).
 */
export async function removeNotebookWithRelated(
  ctx: MutationCtx,
  notebookId: Id<"notebooks">
): Promise<void> {
  const members = await ctx.db
    .query("notebookMembers")
    .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
    .collect();
  for (const m of members) {
    await ctx.db.delete(m._id);
  }
  const shareLinks = await ctx.db
    .query("notebookShareLinks")
    .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
    .collect();
  for (const l of shareLinks) {
    await ctx.db.delete(l._id);
  }
  await deleteNotebook(ctx, notebookId);
}
