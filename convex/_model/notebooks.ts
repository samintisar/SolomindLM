import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";

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

export type NotebookCreate = {
  userId: Id<"users">;
  title: string;
  coverColor?: string;
  icon?: string;
  isFeatured?: boolean;
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
    isFeatured: data.isFeatured ?? false,
    folderId: data.folderId,
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
  isFeatured?: boolean;
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

export async function getReportsByNotebook(
  ctx: QueryCtx,
  notebookId: Id<"notebooks">
): Promise<Doc<"reports">[]> {
  return await ctx.db
    .query("reports")
    .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
    .order("desc")
    .collect();
}
