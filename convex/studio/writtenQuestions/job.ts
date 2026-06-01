"use node";

/**
 * Written questions generation job — Convex registrations only.
 * @see ./writtenQuestionsJobPhases.ts for phase logic.
 */

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import {
  runFinalizeWrittenQuestionsPhase,
  runProcessWrittenQuestionsMapChunkPhase,
  runWrittenQuestionsGenerationPhase,
} from "./writtenQuestionsJobPhases";

export const writtenQuestionsGeneration = internalAction({
  args: {
    writtenQuestionId: v.id("writtenQuestions"),
    userId: v.string(),
    notebookId: v.id("notebooks"),
    documentIds: v.array(v.id("documents")),
    questionCount: v.number(),
    difficulty: v.string(),
    questionType: v.string(),
    focus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    "use node";
    await runWrittenQuestionsGenerationPhase(ctx, args);
  },
});

export const processWrittenQuestionsMapChunk = internalAction({
  args: {
    writtenQuestionId: v.id("writtenQuestions"),
    userId: v.string(),
    notebookId: v.id("notebooks"),
    chunkIndex: v.number(),
    totalChunks: v.number(),
    chunk: v.string(),
    questionCount: v.number(),
    questionsPerChunk: v.number(),
    difficulty: v.string(),
    questionType: v.string(),
    focus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    "use node";
    await runProcessWrittenQuestionsMapChunkPhase(ctx, args);
  },
});

export const finalizeWrittenQuestionsPhase = internalAction({
  args: {
    writtenQuestionId: v.id("writtenQuestions"),
    userId: v.string(),
    notebookId: v.id("notebooks"),
    questionCount: v.number(),
    difficulty: v.string(),
    questionType: v.string(),
    focus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    "use node";
    await runFinalizeWrittenQuestionsPhase(ctx, args);
  },
});
