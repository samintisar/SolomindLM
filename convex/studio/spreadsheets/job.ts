"use node";

/**
 * Spreadsheet generation job — Convex registrations only.
 * @see ./spreadsheetJobPhases.ts for phase logic.
 */

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import {
  runFinalizeSpreadsheetPhase,
  runProcessSpreadsheetMapChunkPhase,
  runSpreadsheetGenerationPhase,
} from "./spreadsheetJobPhases";

export const spreadsheetGeneration = internalAction({
  args: {
    spreadsheetId: v.id("spreadsheets"),
    userId: v.string(),
    notebookId: v.id("notebooks"),
    documentIds: v.array(v.id("documents")),
    spreadsheetType: v.optional(v.string()),
    customPrompt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    "use node";
    await runSpreadsheetGenerationPhase(ctx, args);
  },
});

export const processSpreadsheetMapChunk = internalAction({
  args: {
    spreadsheetId: v.id("spreadsheets"),
    userId: v.string(),
    notebookId: v.id("notebooks"),
    chunkIndex: v.number(),
    totalChunks: v.number(),
    chunk: v.string(),
    spreadsheetType: v.string(),
    customPrompt: v.string(),
  },
  handler: async (ctx, args) => {
    "use node";
    await runProcessSpreadsheetMapChunkPhase(ctx, args);
  },
});

export const finalizeSpreadsheetPhase = internalAction({
  args: {
    spreadsheetId: v.id("spreadsheets"),
    userId: v.string(),
    notebookId: v.id("notebooks"),
    spreadsheetType: v.string(),
    customPrompt: v.string(),
  },
  handler: async (ctx, args) => {
    "use node";
    await runFinalizeSpreadsheetPhase(ctx, args);
  },
});
