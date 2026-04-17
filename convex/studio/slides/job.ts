"use node";
/**
 * Slide deck generation job — Convex registrations only.
 * @see ./slideDeckJobPhases.ts for phase logic.
 */

import { internalAction } from "../../_generated/server";
import { v } from "convex/values";
import {
  runSlideDeckGenerationPhase,
  runProcessSlideDeckMapChunkPhase,
  runFinalizeSlideDeckPhase,
} from "./slideDeckJobPhases";

export const slideDeckGeneration = internalAction({
  args: {
    slideDeckId: v.id("slides"),
    userId: v.string(),
    notebookId: v.id("notebooks"),
    documentIds: v.array(v.id("documents")),
    slideCount: v.number(),
  },
  handler: async (ctx, args) => {
    "use node";
    await runSlideDeckGenerationPhase(ctx, args);
  },
});

export const processSlideDeckMapChunk = internalAction({
  args: {
    slideDeckId: v.id("slides"),
    userId: v.string(),
    notebookId: v.id("notebooks"),
    chunkIndex: v.number(),
    totalChunks: v.number(),
    chunk: v.string(),
    slideCount: v.number(),
    slidesPerChunk: v.number(),
    deckLength: v.string(),
  },
  handler: async (ctx, args) => {
    "use node";
    await runProcessSlideDeckMapChunkPhase(ctx, args);
  },
});

export const finalizeSlideDeckPhase = internalAction({
  args: {
    slideDeckId: v.id("slides"),
    userId: v.string(),
    notebookId: v.id("notebooks"),
    slideCount: v.number(),
    deckLength: v.string(),
  },
  handler: async (ctx, args) => {
    "use node";
    await runFinalizeSlideDeckPhase(ctx, args);
  },
});
