"use node";

/**
 * Audio overview generation job — Convex registrations only.
 * @see ./audioJobPhases.ts for phase logic.
 */

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import {
  runAssembleAudioOverviewPhase,
  runAudioOverviewGenerationPhase,
  runFinalizeAudioOverviewPhase,
  runProcessAudioMapChunkPhase,
  runSynthesizeAudioOverviewChunkPhase,
  runSynthesizeAudioOverviewPhase,
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

export const synthesizeAudioOverviewPhase = internalAction({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    userId: v.string(),
    notebookId: v.id("notebooks"),
  },
  handler: async (ctx, args) => {
    "use node";
    await runSynthesizeAudioOverviewPhase(ctx, args);
  },
});

export const synthesizeAudioOverviewChunk = internalAction({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    userId: v.string(),
    notebookId: v.id("notebooks"),
    chunkIndex: v.number(),
    attempt: v.number(),
  },
  handler: async (ctx, args) => {
    "use node";
    await runSynthesizeAudioOverviewChunkPhase(ctx, args);
  },
});

export const assembleAudioOverviewPhase = internalAction({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    userId: v.string(),
    notebookId: v.id("notebooks"),
  },
  handler: async (ctx, args) => {
    "use node";
    await runAssembleAudioOverviewPhase(ctx, args);
  },
});
