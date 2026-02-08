import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { getAuthUserId } from "./auth";
import * as Notebooks from "./model/notebooks";
import * as Flashcards from "./model/flashcards";

/**
 * List all flashcards for a notebook
 */
export const list = query({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await Flashcards.listByNotebook(ctx, args.notebookId, userId);
  },
});

/**
 * Get a specific flashcard set by ID
 */
export const get = query({
  args: { id: v.id("flashcards") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const flashcard = await Flashcards.getFlashcard(ctx, args.id);

    if (!flashcard || flashcard.userId !== userId) {
      return null;
    }

    return flashcard;
  },
});

/**
 * Create a new flashcard set
 */
export const create = mutation({
  args: {
    notebookId: v.id("notebooks"),
    title: v.string(),
    cardsData: v.optional(v.array(v.any())),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    // Verify user owns the notebook
    const notebook = await Notebooks.getNotebook(ctx, args.notebookId);
    if (!notebook || notebook.userId !== userId) {
      throw new Error("Notebook not found");
    }

    return await Flashcards.createFlashcardAndFetch(ctx, {
      userId,
      notebookId: args.notebookId,
      title: args.title,
      cardsData: args.cardsData,
      metadata: args.metadata,
    });
  },
});

/**
 * Internal: Create a flashcard set (for use by contentGeneration action only).
 * Uses internal so Convex code calls internal.* instead of api.* per best practices.
 */
export const createInternal = internalMutation({
  args: {
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    title: v.string(),
    cardsData: v.optional(v.array(v.any())),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await Flashcards.createFlashcardAndFetch(ctx, {
      userId: args.userId,
      notebookId: args.notebookId,
      title: args.title,
      cardsData: args.cardsData,
      metadata: args.metadata,
    });
  },
});

/**
 * Update a flashcard set
 */
export const update = mutation({
  args: {
    id: v.id("flashcards"),
    title: v.optional(v.string()),
    status: v.optional(v.string()),
    cardsData: v.optional(v.array(v.any())),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const { id, ...rest } = args;
    const metadata = rest.metadata;
    const otherUpdates: Omit<typeof rest, "metadata"> = rest;

    // Verify ownership
    const existing = await Flashcards.getFlashcard(ctx, id);
    if (!existing || existing.userId !== userId) {
      throw new Error("Flashcard set not found");
    }

    await Flashcards.updateFlashcard(ctx, id, otherUpdates, !!metadata);

    // Merge metadata if provided
    if (metadata) {
      await Flashcards.patchFlashcard(ctx, id, { metadata });
    }

    return await Flashcards.getFlashcard(ctx, id);
  },
});

/**
 * Delete a flashcard set
 */
export const remove = mutation({
  args: { id: v.id("flashcards") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const flashcard = await Flashcards.getFlashcard(ctx, args.id);
    if (!flashcard || flashcard.userId !== userId) {
      throw new Error("Flashcard set not found");
    }

    await Flashcards.deleteFlashcard(ctx, args.id);

    return { message: "Flashcard set deleted successfully" };
  },
});

/**
 * Internal: Update flashcard set status
 */
export const updateStatus = internalMutation({
  args: {
    flashcardId: v.id("flashcards"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    await Flashcards.updateFlashcardStatus(ctx, args.flashcardId, args.status);
  },
});

/**
 * Internal: Update flashcard set data
 */
export const updateData = internalMutation({
  args: {
    flashcardId: v.id("flashcards"),
    cardsData: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    await Flashcards.updateFlashcardData(ctx, args.flashcardId, args.cardsData);
  },
});

/**
 * Internal: Update flashcard set with partial updates
 */
export const patch = internalMutation({
  args: {
    flashcardId: v.id("flashcards"),
    patch: v.any(),
  },
  handler: async (ctx, args) => {
    await Flashcards.patchFlashcard(ctx, args.flashcardId, args.patch);
  },
});
