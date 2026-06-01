"use node";

/**
 * Mind map generation job — Convex registrations only.
 * @see ./mindmapJobPhases.ts for phase logic.
 */

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import {
  runFinalizeMindMapPhase,
  runMindmapGenerationPhase,
  runProcessMindMapMapChunkPhase,
} from "./mindmapJobPhases";

export const mindmapGeneration = internalAction({
  args: {
    mindmapId: v.id("mindmaps"),
    userId: v.string(),
    notebookId: v.id("notebooks"),
    documentIds: v.array(v.id("documents")),
  },
  handler: async (ctx, args) => {
    "use node";
    await runMindmapGenerationPhase(ctx, args);
  },
});

export const processMindMapMapChunk = internalAction({
  args: {
    mindmapId: v.id("mindmaps"),
    userId: v.string(),
    notebookId: v.id("notebooks"),
    chunkIndex: v.number(),
    totalChunks: v.number(),
    chunk: v.string(),
  },
  handler: async (ctx, args) => {
    "use node";
    await runProcessMindMapMapChunkPhase(ctx, args);
  },
});

export const finalizeMindMapPhase = internalAction({
  args: {
    mindmapId: v.id("mindmaps"),
    userId: v.string(),
    notebookId: v.id("notebooks"),
  },
  handler: async (ctx, args) => {
    "use node";
    await runFinalizeMindMapPhase(ctx, args);
  },
});
