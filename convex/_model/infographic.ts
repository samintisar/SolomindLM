import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";

/**
 * Database operations for infographics.
 * No query/mutation/action exports — used by convex/infographic.ts and jobs.
 */

export async function getInfographic(
  ctx: QueryCtx,
  infographicId: Id<"infographics">
): Promise<Doc<"infographics"> | null> {
  return await ctx.db.get("infographics", infographicId);
}

export async function listByNotebook(
  ctx: QueryCtx,
  notebookId: Id<"notebooks">,
  userId?: Id<"users">
): Promise<Doc<"infographics">[]> {
  const query = ctx.db
    .query("infographics")
    .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId));

  if (userId) {
    return await ctx.db
      .query("infographics")
      .withIndex("by_notebook_and_user", (q) =>
        q.eq("notebookId", notebookId).eq("userId", userId)
      )
      .order("desc")
      .collect();
  }
  return await query.order("desc").collect();
}

export type InfographicCreate = {
  userId: Id<"users">;
  notebookId: Id<"notebooks">;
  title: string;
  data?: unknown;
  metadata?: unknown;
  status?: string;
};

export async function createInfographic(
  ctx: MutationCtx,
  data: InfographicCreate
): Promise<Id<"infographics">> {
  const now = Date.now();
  return await ctx.db.insert("infographics", {
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
 * Create an infographic and return the created document.
 */
export async function createInfographicAndFetch(
  ctx: MutationCtx,
  data: InfographicCreate
): Promise<Doc<"infographics">> {
  const id = await createInfographic(ctx, data);
  const infographic = await getInfographic(ctx, id);
  if (!infographic) throw new Error("Failed to create infographic");
  return infographic;
}

export type InfographicUpdate = {
  title?: string;
  status?: string;
  data?: unknown;
  metadata?: unknown;
};

export async function updateInfographic(
  ctx: MutationCtx,
  infographicId: Id<"infographics">,
  updates: InfographicUpdate
): Promise<void> {
  await ctx.db.patch("infographics", infographicId, {
    ...updates,
    updatedAt: Date.now(),
  });
}

export async function updateInfographicStatus(
  ctx: MutationCtx,
  infographicId: Id<"infographics">,
  status: string
): Promise<void> {
  await ctx.db.patch("infographics", infographicId, {
    status,
    updatedAt: Date.now(),
  });
}

export async function updateInfographicData(
  ctx: MutationCtx,
  infographicId: Id<"infographics">,
  data: unknown
): Promise<void> {
  await ctx.db.patch("infographics", infographicId, {
    data,
    status: "completed",
    updatedAt: Date.now(),
  });
}

export async function patchInfographic(
  ctx: MutationCtx,
  infographicId: Id<"infographics">,
  patch: Record<string, unknown>
): Promise<void> {
  await ctx.db.patch("infographics", infographicId, {
    ...patch,
    updatedAt: Date.now(),
  });
}

export async function deleteInfographic(ctx: MutationCtx, infographicId: Id<"infographics">): Promise<void> {
  await ctx.db.delete("infographics", infographicId);
}
