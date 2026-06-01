import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type DbCtx = QueryCtx | MutationCtx;

export type NotebookAccessRole = "owner" | "editor";

export async function getNotebookMember(
  ctx: DbCtx,
  notebookId: Id<"notebooks">,
  userId: Id<"users">
): Promise<Doc<"notebookMembers"> | null> {
  return await ctx.db
    .query("notebookMembers")
    .withIndex("by_notebook_and_user", (q) => q.eq("notebookId", notebookId).eq("userId", userId))
    .unique();
}

/**
 * Returns owner if user owns the notebook, editor if they are a member, else null.
 */
export async function getNotebookAccess(
  ctx: DbCtx,
  notebookId: Id<"notebooks">,
  userId: Id<"users">
): Promise<NotebookAccessRole | null> {
  const notebook = await ctx.db.get(notebookId);
  if (!notebook) return null;
  if (notebook.userId === userId) return "owner";
  const member = await getNotebookMember(ctx, notebookId, userId);
  if (member) return "editor";
  return null;
}

export async function assertCanReadNotebook(
  ctx: DbCtx,
  notebookId: Id<"notebooks">,
  userId: Id<"users">
): Promise<{ notebook: Doc<"notebooks">; access: NotebookAccessRole }> {
  const notebook = await ctx.db.get(notebookId);
  if (!notebook) {
    throw new Error("Notebook not found");
  }
  const access = await getNotebookAccess(ctx, notebookId, userId);
  if (!access) {
    throw new Error("Notebook not found");
  }
  return { notebook, access };
}

export async function assertCanEditNotebook(
  ctx: DbCtx,
  notebookId: Id<"notebooks">,
  userId: Id<"users">
): Promise<{ notebook: Doc<"notebooks">; access: NotebookAccessRole }> {
  const { notebook, access } = await assertCanReadNotebook(ctx, notebookId, userId);
  if (access !== "owner" && access !== "editor") {
    throw new Error("Access denied");
  }
  return { notebook, access };
}

export async function assertNotebookOwner(
  ctx: DbCtx,
  notebookId: Id<"notebooks">,
  userId: Id<"users">
): Promise<Doc<"notebooks">> {
  const notebook = await ctx.db.get(notebookId);
  if (!notebook || notebook.userId !== userId) {
    throw new Error("Notebook not found");
  }
  return notebook;
}

export function isNotebookOwner(notebook: Doc<"notebooks">, userId: Id<"users">): boolean {
  return notebook.userId === userId;
}
