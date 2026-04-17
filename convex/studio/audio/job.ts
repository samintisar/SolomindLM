"use node";
/**
 * Audio overview generation job — Convex registrations only.
 * @see ./audioJobPhases.ts for phase logic.
 */

import { internalAction } from "../../_generated/server";
import { v } from "convex/values";
import {
  runAudioOverviewGenerationPhase,
  runProcessAudioMapChunkPhase,
  runFinalizeAudioOverviewPhase,
} from "./audioJobPhases";

export const audioOverviewGeneration = internalAction({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    userId: v.string(),
    notebookId: v.id("notebooks"),
    documentIds: v.array(v.id("documents")),
  },
  handler: async (ctx, args) => {
    "use node";
    await runAudioOverviewGenerationPhase(ctx, args);
  },
});

export const processAudioMapChunk = internalAction({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    userId: v.string(),
    notebookId: v.id("notebooks"),
    chunkIndex: v.number(),
    totalChunks: v.number(),
    chunk: v.string(),
  },
  handler: async (ctx, args) => {
    "use node";
    await runProcessAudioMapChunkPhase(ctx, args);
  },
});

export const finalizeAudioOverviewPhase = internalAction({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    userId: v.string(),
    notebookId: v.id("notebooks"),
  },
  handler: async (ctx, args) => {
    "use node";
    await runFinalizeAudioOverviewPhase(ctx, args);
  },
});
