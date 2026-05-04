import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";
import {
  calculateNextReview,
  initializeProficiency,
  type CardProficiency,
} from "../_lib/srsScheduling";

export type { CardProficiency, SM2State } from "../_lib/srsScheduling";
export { calculateNextReview, initializeProficiency };

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
    return await ctx.db
      .query("flashcards")
      .withIndex("by_notebook_and_user", (q) => q.eq("notebookId", notebookId).eq("userId", userId))
      .order("desc")
      .collect();
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

/**
 * Update card proficiency after a review
 * @param proficiency - Current proficiency data
 * @param rating - User rating
 * @returns Updated proficiency data
 */
export function updateProficiencyAfterReview(
  proficiency: CardProficiency | undefined,
  rating: "again" | "hard" | "good" | "easy"
): CardProficiency {
  const current = proficiency || initializeProficiency();

  // Update statistics
  const updated: CardProficiency = {
    ...current,
    totalReviews: current.totalReviews + 1,
    lastReviewedAt: Date.now(),
  };

  if (rating === "again") {
    updated.incorrectCount = current.incorrectCount + 1;
    updated.streak = 0;
  } else {
    updated.correctCount = current.correctCount + 1;
    updated.streak = current.streak + 1;
  }

  // Calculate next review
  const sm2State = calculateNextReview(
    {
      interval: current.interval,
      easeFactor: current.easeFactor,
      phase: current.phase,
      learningStep: current.learningStep,
      totalReviews: current.totalReviews,
    },
    rating
  );

  updated.interval = sm2State.interval;
  updated.easeFactor = sm2State.easeFactor;
  updated.nextReviewDate = sm2State.nextReviewDate;
  updated.phase = sm2State.phase;
  if (sm2State.learningStep === undefined) {
    delete updated.learningStep;
  } else {
    updated.learningStep = sm2State.learningStep;
  }

  return updated;
}

/**
 * Check if a card is due for review
 * @param proficiency - Card proficiency data
 * @returns true if card is due (nextReviewDate <= now or not yet reviewed)
 */
export function isCardDue(
  proficiency: CardProficiency | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!proficiency || !proficiency.nextReviewDate) {
    // New card (never reviewed) - always due
    return true;
  }
  return proficiency.nextReviewDate <= nowMs;
}

/**
 * Get cards that are due for review from a flashcard set
 * @param cardsData - Array of cards with proficiency data
 * @returns Array of indices for due cards
 */
export function getDueCardIndices(
  cardsData: Array<{ proficiency?: CardProficiency }>,
  nowMs: number
): number[] {
  return cardsData
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => {
      const proficiency = card.proficiency;
      if (!proficiency || !proficiency.nextReviewDate) {
        return true; // New card
      }
      return proficiency.nextReviewDate <= nowMs;
    })
    .map(({ index }) => index);
}

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
  // If updating metadata, merge with existing metadata instead of replacing
  if (patch.metadata) {
    const existing = await getFlashcard(ctx, flashcardId);
    if (existing) {
      patch = {
        ...patch,
        metadata: {
          ...((existing.metadata as Record<string, unknown>) ?? {}),
          ...(patch.metadata as Record<string, unknown>),
        },
      };
    }
  }

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
