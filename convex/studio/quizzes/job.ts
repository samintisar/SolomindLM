"use node";
/**
 * Quiz generation job — Convex registrations only.
 * @see ./quizJobPhases.ts for phase logic.
 */

import { internalAction } from "../../_generated/server";
import { v } from "convex/values";
import {
  runQuizGenerationPhase,
  runProcessQuizMapChunkPhase,
  runFinalizeQuizPhase,
} from "./quizJobPhases";

export const quizGeneration = internalAction({
  args: {
    quizId: v.id("quizzes"),
    userId: v.string(),
    notebookId: v.id("notebooks"),
    documentIds: v.array(v.id("documents")),
    questionCount: v.number(),
    difficulty: v.string(),
    focus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    "use node";
    await runQuizGenerationPhase(ctx, args);
  },
});

export const processQuizMapChunk = internalAction({
  args: {
    quizId: v.id("quizzes"),
    userId: v.string(),
    notebookId: v.id("notebooks"),
    chunkIndex: v.number(),
    totalChunks: v.number(),
    chunk: v.string(),
    questionCount: v.number(),
    questionsPerChunk: v.number(),
    difficulty: v.string(),
    focus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    "use node";
    await runProcessQuizMapChunkPhase(ctx, args);
  },
});

export const finalizeQuizPhase = internalAction({
  args: {
    quizId: v.id("quizzes"),
    userId: v.string(),
    notebookId: v.id("notebooks"),
    questionCount: v.number(),
    difficulty: v.string(),
    focus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    "use node";
    await runFinalizeQuizPhase(ctx, args);
  },
});
