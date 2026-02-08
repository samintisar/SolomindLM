import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";

/**
 * Database operations for flashcards.
 * No query/mutation/action exports — used by convex/flashcards.ts and jobs.
 */

export async function getFlashcard(
  ctx: QueryCtx,
  flashcardId: Id<"flashcards">
): Promise<Doc<"flashcards"> | null> {
  return await ctx.db.get("flashcards", flashcardId);
}

export async function listByNotebook(
  ctx: QueryCtx,
  notebookId: Id<"notebooks">,
  userId?: Id<"users">
): Promise<Doc<"flashcards">[]> {
  const query = ctx.db
    .query("flashcards")
    .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId));

  if (userId) {
    return await query.filter((q) => q.eq(q.field("userId"), userId)).order("desc").collect();
  }
  return await query.order("desc").collect();
}

export type FlashcardCreate = {
  userId: Id<"users">;
  notebookId: Id<"notebooks">;
  title: string;
  cardsData?: unknown[];
  metadata?: unknown;
};

export async function createFlashcard(
  ctx: MutationCtx,
  data: FlashcardCreate
): Promise<Id<"flashcards">> {
  const now = Date.now();
  return await ctx.db.insert("flashcards", {
    userId: data.userId,
    notebookId: data.notebookId,
    title: data.title,
    status: "draft",
    cardsData: data.cardsData ?? [],
    metadata: data.metadata,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Create a flashcard set and return the created document.
 */
export async function createFlashcardAndFetch(
  ctx: MutationCtx,
  data: FlashcardCreate
): Promise<Doc<"flashcards">> {
  const id = await createFlashcard(ctx, data);
  const flashcard = await getFlashcard(ctx, id);
  if (!flashcard) throw new Error("Failed to create flashcard set");
  return flashcard;
}

export type FlashcardUpdate = {
  title?: string;
  status?: string;
  cardsData?: unknown[];
  metadata?: unknown;
};

export async function updateFlashcard(
  ctx: MutationCtx,
  flashcardId: Id<"flashcards">,
  updates: FlashcardUpdate,
  mergeMetadata = false
): Promise<void> {
  const updateData: Record<string, unknown> = {
    ...updates,
    updatedAt: Date.now(),
  };

  if (mergeMetadata && updates.metadata) {
    const existing = await getFlashcard(ctx, flashcardId);
    if (existing) {
      updateData.metadata = {
        ...(existing.metadata ?? {}),
        ...(updates.metadata as Record<string, unknown>),
      };
    }
  }

  await ctx.db.patch("flashcards", flashcardId, updateData);
}

export async function updateFlashcardStatus(
  ctx: MutationCtx,
  flashcardId: Id<"flashcards">,
  status: string
): Promise<void> {
  await ctx.db.patch("flashcards", flashcardId, {
    status,
    updatedAt: Date.now(),
  });
}

export async function updateFlashcardData(
  ctx: MutationCtx,
  flashcardId: Id<"flashcards">,
  cardsData: unknown[]
): Promise<void> {
  await ctx.db.patch("flashcards", flashcardId, {
    cardsData,
    status: "completed",
    updatedAt: Date.now(),
  });
}

export async function patchFlashcard(
  ctx: MutationCtx,
  flashcardId: Id<"flashcards">,
  patch: Record<string, unknown>
): Promise<void> {
  await ctx.db.patch("flashcards", flashcardId, {
    ...patch,
    updatedAt: Date.now(),
  });
}

export async function deleteFlashcard(
  ctx: MutationCtx,
  flashcardId: Id<"flashcards">
): Promise<void> {
  await ctx.db.delete("flashcards", flashcardId);
}
