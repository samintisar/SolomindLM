import { internalMutation } from "../../_generated/server";
import { v } from "convex/values";
import { normalizeMathMarkdownDeep } from "../../_shared/mathMarkdown";
import { buildErrorMetadata } from "./jobErrorUtils";

export const updateFlashcardTitle = internalMutation({
  args: {
    flashcardId: v.id("flashcards"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.flashcardId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

export const saveFlashcardResults = internalMutation({
  args: {
    flashcardId: v.id("flashcards"),
    flashcards: v.array(v.any()),
    metadata: v.any(),
  },
  handler: async (ctx, args) => {
    const normalizedFlashcards = normalizeMathMarkdownDeep(args.flashcards);

    await ctx.db.patch(args.flashcardId, {
      cardsData: normalizedFlashcards,
      status: "completed",
      updatedAt: Date.now(),
      title: args.metadata?.title ?? "Flashcards",
      metadata: {
        ...args.metadata,
        cardCount: normalizedFlashcards.length,
        completedAt: Date.now(),
      },
    });
  },
});

export const updateFlashcardStatus = internalMutation({
  args: {
    flashcardId: v.id("flashcards"),
    status: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const updates: any = {
      status: args.status,
      updatedAt: Date.now(),
    };
    if (args.metadata) {
      updates.metadata = args.metadata;
    }
    await ctx.db.patch(args.flashcardId, updates);
  },
});

export const markFlashcardFailed = internalMutation({
  args: {
    flashcardId: v.id("flashcards"),
    error: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const errorMetadata = buildErrorMetadata(
      args.error,
      args.metadata?.phase || "unknown",
      args.metadata
    );
    await ctx.db.patch(args.flashcardId, {
      status: "failed",
      updatedAt: Date.now(),
      metadata: {
        ...args.metadata,
        ...errorMetadata,
      },
    });
  },
});

// Multi-phase flashcard helpers
export const initFlashcardMapPhase = internalMutation({
  args: {
    flashcardId: v.id("flashcards"),
    totalMapTasks: v.number(),
    cardCount: v.number(),
    difficulty: v.string(),
    topic: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const flashcard = await ctx.db.get(args.flashcardId);
    if (!flashcard) return null;

    await ctx.db.patch(args.flashcardId, {
      status: "generating",
      updatedAt: Date.now(),
      metadata: {
        ...flashcard.metadata,
        phase: "map_processing",
        progress: 30,
        currentStep: "Processing content...",
        totalMapTasks: args.totalMapTasks,
        completedMapTasks: 0,
        mapResults: {},
        cardCount: args.cardCount,
        difficulty: args.difficulty,
        topic: args.topic,
      },
    });
    return args.flashcardId;
  },
});

export const storeFlashcardMapResult = internalMutation({
  args: {
    flashcardId: v.id("flashcards"),
    chunkIndex: v.number(),
    result: v.string(),
  },
  handler: async (ctx, args) => {
    const flashcard = await ctx.db.get(args.flashcardId);
    if (!flashcard) return null;

    const existingResults = flashcard.metadata?.mapResults || {};
    const updatedResults = {
      ...existingResults,
      [args.chunkIndex]: args.result,
    };

    const completedCount = Object.keys(updatedResults).length;
    const totalCount = flashcard.metadata?.totalMapTasks || 0;

    await ctx.db.patch(args.flashcardId, {
      updatedAt: Date.now(),
      metadata: {
        ...flashcard.metadata,
        mapResults: updatedResults,
        completedMapTasks: completedCount,
        progress: 30 + Math.floor((completedCount / totalCount) * 30),
      },
    });
    return args.flashcardId;
  },
});

export const clearFlashcardMapData = internalMutation({
  args: {
    flashcardId: v.id("flashcards"),
  },
  handler: async (ctx, args) => {
    const flashcard = await ctx.db.get(args.flashcardId);
    if (!flashcard) return null;

    const { mapResults: _mapResults, ...restMetadata } = flashcard.metadata || {};
    await ctx.db.patch(args.flashcardId, {
      updatedAt: Date.now(),
      metadata: restMetadata,
    });
    return args.flashcardId;
  },
});
