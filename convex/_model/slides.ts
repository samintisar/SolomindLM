import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";

/**
 * Database operations for slide decks.
 * No query/mutation/action exports — used by convex/slides.ts and jobs.
 */

export async function getSlideDeck(
  ctx: QueryCtx,
  slideDeckId: Id<"slides">
): Promise<Doc<"slides"> | null> {
  return await ctx.db.get("slides", slideDeckId);
}

export async function listByNotebook(
  ctx: QueryCtx,
  notebookId: Id<"notebooks">,
  userId?: Id<"users">
): Promise<Doc<"slides">[]> {
  const query = ctx.db
    .query("slides")
    .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId));

  if (userId) {
    return await query
      .filter((q) => q.eq(q.field("userId"), userId))
      .order("desc")
      .collect();
  }
  return await query.order("desc").collect();
}

export type SlideDeckCreate = {
  userId: Id<"users">;
  notebookId: Id<"notebooks">;
  title: string;
  data?: unknown;
  slideCount?: number;
  metadata?: unknown;
  status?: string;
};

export async function createSlideDeck(
  ctx: MutationCtx,
  data: SlideDeckCreate
): Promise<Id<"slides">> {
  const now = Date.now();
  return await ctx.db.insert("slides", {
    userId: data.userId,
    notebookId: data.notebookId,
    title: data.title,
    status: data.status ?? "draft",
    data: data.data ?? {},
    slideCount: data.slideCount,
    metadata: data.metadata,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Create a slide deck and return the created document.
 */
export async function createSlideDeckAndFetch(
  ctx: MutationCtx,
  data: SlideDeckCreate
): Promise<Doc<"slides">> {
  const id = await createSlideDeck(ctx, data);
  const slideDeck = await getSlideDeck(ctx, id);
  if (!slideDeck) throw new Error("Failed to create slide deck");
  return slideDeck;
}

export type SlideDeckUpdate = {
  title?: string;
  status?: string;
  data?: unknown;
  slideCount?: number;
  metadata?: unknown;
};

export async function updateSlideDeck(
  ctx: MutationCtx,
  slideDeckId: Id<"slides">,
  updates: SlideDeckUpdate
): Promise<void> {
  await ctx.db.patch("slides", slideDeckId, {
    ...updates,
    updatedAt: Date.now(),
  });
}

export async function updateSlideDeckStatus(
  ctx: MutationCtx,
  slideDeckId: Id<"slides">,
  status: string
): Promise<void> {
  await ctx.db.patch("slides", slideDeckId, {
    status,
    updatedAt: Date.now(),
  });
}

export async function updateSlideDeckData(
  ctx: MutationCtx,
  slideDeckId: Id<"slides">,
  data: unknown
): Promise<void> {
  await ctx.db.patch("slides", slideDeckId, {
    data,
    status: "completed",
    updatedAt: Date.now(),
  });
}

export async function patchSlideDeck(
  ctx: MutationCtx,
  slideDeckId: Id<"slides">,
  patch: Record<string, unknown>
): Promise<void> {
  await ctx.db.patch("slides", slideDeckId, {
    ...patch,
    updatedAt: Date.now(),
  });
}

export async function deleteSlideDeck(ctx: MutationCtx, slideDeckId: Id<"slides">): Promise<void> {
  await ctx.db.delete("slides", slideDeckId);
}
