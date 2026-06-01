"use node";

/**
 * Report generation job — Convex registrations only.
 * @see ./reportJobPhases.ts for phase logic.
 */

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import {
  runFinalizeReportPhase,
  runProcessReportMapChunkPhase,
  runReportGenerationPhase,
} from "./reportJobPhases";

export const reportGeneration = internalAction({
  args: {
    reportId: v.id("reports"),
    userId: v.string(),
    notebookId: v.id("notebooks"),
    documentIds: v.array(v.id("documents")),
    reportType: v.optional(v.string()),
    customPrompt: v.optional(v.string()),
    smartLlm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    "use node";
    await runReportGenerationPhase(ctx, args);
  },
});

export const processReportMapChunk = internalAction({
  args: {
    reportId: v.id("reports"),
    userId: v.string(),
    notebookId: v.id("notebooks"),
    chunkIndex: v.number(),
    totalChunks: v.number(),
    chunk: v.string(),
    reportType: v.string(),
    customPrompt: v.optional(v.string()),
    smartLlm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    "use node";
    await runProcessReportMapChunkPhase(ctx, args);
  },
});

export const finalizeReportPhase = internalAction({
  args: {
    reportId: v.id("reports"),
    userId: v.string(),
    notebookId: v.id("notebooks"),
    reportType: v.string(),
    customPrompt: v.optional(v.string()),
    smartLlm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    "use node";
    await runFinalizeReportPhase(ctx, args);
  },
});
