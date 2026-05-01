"use node";
/**
 * Flashcard generation job — Convex registrations only.
 * @see ./flashcardJobPhases.ts for phase logic.
 */

import { internalAction } from "../../_generated/server";
import { v } from "convex/values";
import {
  runFlashcardGenerationPhase,
  runProcessFlashcardMapChunkPhase,
  runFinalizeFlashcardPhase,
} from "./flashcardJobPhases";

export const flashcardGeneration = internalAction({
  args: {
    flashcardId: v.id("flashcards"),
    userId: v.string(),
    notebookId: v.id("notebooks"),
    documentIds: v.array(v.id("documents")),
    cardCount: v.number(),
    difficulty: v.string(),
    topic: v.optional(v.string()),
    smartLlm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    "use node";
    await runFlashcardGenerationPhase(ctx, args);
  },
});

export const processFlashcardMapChunk = internalAction({
  args: {
    flashcardId: v.id("flashcards"),
    userId: v.string(),
    notebookId: v.id("notebooks"),
    chunkIndex: v.number(),
    totalChunks: v.number(),
    chunk: v.string(),
    cardCount: v.number(),
    cardsPerChunk: v.number(),
    difficulty: v.string(),
    topic: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    "use node";
    await runProcessFlashcardMapChunkPhase(ctx, args);
  },
});

export const finalizeFlashcardPhase = internalAction({
  args: {
    flashcardId: v.id("flashcards"),
    userId: v.string(),
    notebookId: v.id("notebooks"),
    cardCount: v.number(),
    difficulty: v.string(),
    topic: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    "use node";
    await runFinalizeFlashcardPhase(ctx, args);
  },
});
