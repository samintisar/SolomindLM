/**
 * Job Helpers - Centralized mutations for job status updates
 *
 * This file contains all helper mutations for job management.
 * Functions are organized by job type for easy navigation.
 */
import { internalMutation } from "../../_generated/server";
import { v } from "convex/values";
import { type JobErrorType } from "./logging";

// ============================================================
// SHARED ERROR UTILITIES
// ============================================================

/**
 * Standard error metadata interface for job failures.
 */
export const jobErrorMetadataValidator = v.object({
  type: v.string(),
  phase: v.string(),
  message: v.string(),
  retryable: v.boolean(),
  timestamp: v.number(),
  stackTrace: v.optional(v.string()),
});

/**
 * Build enhanced error metadata for database storage.
 */
 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildErrorMetadata(error: string, phase: string, metadata?: any): any {
  if (metadata?.errorType && metadata?.errorPhase) {
    return {
      error: {
        type: metadata.errorType,
        phase: metadata.errorPhase,
        message: error.length > 500 ? error.substring(0, 500) + "..." : error,
        retryable: metadata.retryable ?? false,
        timestamp: metadata.failedAt ?? Date.now(),
        stackTrace: metadata.stack,
      },
      failedAt: metadata.failedAt ?? Date.now(),
      phase: "failed",
    };
  }

  const errorType = metadata?.isTimeout ? "llm_timeout" : classifyErrorFromMessage(error);
  const retryable = isRetryableFromType(errorType);

  return {
    error: {
      type: errorType,
      phase: phase || metadata?.errorPhase || metadata?.phase || "unknown",
      message: error.length > 500 ? error.substring(0, 500) + "..." : error,
      retryable,
      timestamp: Date.now(),
      stackTrace: metadata?.stack,
    },
    failedAt: Date.now(),
    phase: "failed",
    errorPhase: phase || metadata?.phase || "unknown",
    isTimeout: metadata?.isTimeout ?? errorType === "llm_timeout",
    errorName: metadata?.errorName ?? "Error",
  };
}

function classifyErrorFromMessage(message: string): JobErrorType {
  const lower = message.toLowerCase();

  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("524")) {
    return "llm_timeout";
  }
  if (lower.includes("rate limit") || lower.includes("429")) {
    return "rate_limit";
  }
  if (lower.includes("embedding") || lower.includes("vector")) {
    return "embedding_failure";
  }
  if (lower.includes("parse") || lower.includes("json") || lower.includes("invalid")) {
    return "parsing_error";
  }
  if (lower.includes("ocr") || lower.includes("extract") || lower.includes("transcript")) {
    return "extraction_failure";
  }
  if (lower.includes("storage") || lower.includes("upload")) {
    return "storage_error";
  }

  return "unknown";
}

function isRetryableFromType(type: JobErrorType): boolean {
  return ["llm_timeout", "rate_limit", "storage_error", "extraction_failure"].includes(type);
}

// ============================================================
// DOCUMENT HELPERS
// ============================================================

export const updateDocumentJobStatus = internalMutation({
  args: {
    documentId: v.id("documents"),
    status: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { documentId, status, metadata } = args;
    await ctx.db.patch(documentId, {
      status,
      ...(metadata && { metadata }),
    });
    return documentId;
  },
});

export const markDocumentJobFailed = internalMutation({
  args: {
    documentId: v.id("documents"),
    error: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { documentId, error, metadata } = args;
    const errorMetadata = buildErrorMetadata(error, metadata?.phase || "unknown", metadata);
    await ctx.db.patch(documentId, {
      status: "failed",
      error,
      metadata: {
        ...metadata,
        ...errorMetadata,
      },
    });
  },
});

// ============================================================
// FLASHCARD HELPERS
// ============================================================

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
    await ctx.db.patch(args.flashcardId, {
      cardsData: args.flashcards,
      status: "completed",
      updatedAt: Date.now(),
      title: args.metadata?.title ?? "Flashcards",
      metadata: {
        ...args.metadata,
        cardCount: args.flashcards.length,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    const { mapResults: _mapResults, ...restMetadata } =flashcard.metadata || {};
    await ctx.db.patch(args.flashcardId, {
      updatedAt: Date.now(),
      metadata: restMetadata,
    });
    return args.flashcardId;
  },
});

// ============================================================
// QUIZ HELPERS
// ============================================================

export const saveQuizResults = internalMutation({
  args: {
    quizId: v.id("quizzes"),
    questions: v.array(v.any()),
    metadata: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.quizId, {
      questionsData: args.questions,
      status: "completed",
      updatedAt: Date.now(),
      title: args.metadata?.title ?? "Quiz",
      metadata: {
        ...args.metadata,
        questionCount: args.questions.length,
        completedAt: Date.now(),
      },
    });
  },
});

export const updateQuizTitle = internalMutation({
  args: {
    quizId: v.id("quizzes"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.quizId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

export const updateQuizStatus = internalMutation({
  args: {
    quizId: v.id("quizzes"),
    status: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: any = {
      status: args.status,
      updatedAt: Date.now(),
    };
    if (args.metadata) {
      updates.metadata = args.metadata;
    }
    await ctx.db.patch(args.quizId, updates);
  },
});

export const markQuizFailed = internalMutation({
  args: {
    quizId: v.id("quizzes"),
    error: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const errorMetadata = buildErrorMetadata(
      args.error,
      args.metadata?.phase || "unknown",
      args.metadata
    );
    await ctx.db.patch(args.quizId, {
      status: "failed",
      updatedAt: Date.now(),
      metadata: {
        ...args.metadata,
        ...errorMetadata,
      },
    });
  },
});

// Multi-phase quiz helpers
export const initQuizMapPhase = internalMutation({
  args: {
    quizId: v.id("quizzes"),
    totalMapTasks: v.number(),
    questionCount: v.number(),
    difficulty: v.string(),
    focus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const quiz = await ctx.db.get(args.quizId);
    if (!quiz) return null;

    await ctx.db.patch(args.quizId, {
      status: "generating",
      updatedAt: Date.now(),
      metadata: {
        ...quiz.metadata,
        phase: "map_processing",
        progress: 30,
        totalMapTasks: args.totalMapTasks,
        completedMapTasks: 0,
        mapResults: {},
        questionCount: args.questionCount,
        difficulty: args.difficulty,
        focus: args.focus,
      },
    });
    return args.quizId;
  },
});

export const storeQuizMapResult = internalMutation({
  args: {
    quizId: v.id("quizzes"),
    chunkIndex: v.number(),
    result: v.string(),
  },
  handler: async (ctx, args) => {
    const quiz = await ctx.db.get(args.quizId);
    if (!quiz) return null;

    const existingResults = quiz.metadata?.mapResults || {};
    const updatedResults = {
      ...existingResults,
      [args.chunkIndex]: args.result,
    };

    const completedCount = Object.keys(updatedResults).length;
    const totalCount = quiz.metadata?.totalMapTasks || 0;

    await ctx.db.patch(args.quizId, {
      updatedAt: Date.now(),
      metadata: {
        ...quiz.metadata,
        mapResults: updatedResults,
        completedMapTasks: completedCount,
        progress: 30 + Math.floor((completedCount / totalCount) * 30),
      },
    });
    return args.quizId;
  },
});

export const clearQuizMapData = internalMutation({
  args: {
    quizId: v.id("quizzes"),
  },
  handler: async (ctx, args) => {
    const quiz = await ctx.db.get(args.quizId);
    if (!quiz) return null;

    const { mapResults: _mapResults, ...restMetadata } =quiz.metadata || {};
    await ctx.db.patch(args.quizId, {
      updatedAt: Date.now(),
      metadata: restMetadata,
    });
    return args.quizId;
  },
});

// ============================================================
// WRITTEN QUESTIONS HELPERS
// ============================================================

export const updateWrittenQuestionsTitle = internalMutation({
  args: {
    writtenQuestionId: v.id("writtenQuestions"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.writtenQuestionId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

export const saveWrittenQuestionsResults = internalMutation({
  args: {
    writtenQuestionId: v.id("writtenQuestions"),
    questions: v.array(v.any()),
    metadata: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.writtenQuestionId, {
      questionsData: args.questions,
      status: "completed",
      updatedAt: Date.now(),
      title: args.metadata?.title ?? "Written Questions",
      metadata: {
        ...args.metadata,
        questionCount: args.questions.length,
        completedAt: Date.now(),
      },
    });
  },
});

export const updateWrittenQuestionsStatus = internalMutation({
  args: {
    writtenQuestionId: v.id("writtenQuestions"),
    status: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: any = {
      status: args.status,
      updatedAt: Date.now(),
    };
    if (args.metadata) {
      updates.metadata = args.metadata;
    }
    await ctx.db.patch(args.writtenQuestionId, updates);
  },
});

export const markWrittenQuestionsFailed = internalMutation({
  args: {
    writtenQuestionId: v.id("writtenQuestions"),
    error: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const errorMetadata = buildErrorMetadata(
      args.error,
      args.metadata?.phase || "unknown",
      args.metadata
    );
    await ctx.db.patch(args.writtenQuestionId, {
      status: "failed",
      updatedAt: Date.now(),
      metadata: {
        ...args.metadata,
        ...errorMetadata,
      },
    });
  },
});

// Multi-phase written questions helpers
export const initWrittenQuestionsMapPhase = internalMutation({
  args: {
    writtenQuestionId: v.id("writtenQuestions"),
    totalMapTasks: v.number(),
    questionCount: v.number(),
    difficulty: v.string(),
    questionType: v.string(),
    focus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const writtenQuestion = await ctx.db.get(args.writtenQuestionId);
    if (!writtenQuestion) return null;

    await ctx.db.patch(args.writtenQuestionId, {
      status: "generating",
      updatedAt: Date.now(),
      metadata: {
        ...writtenQuestion.metadata,
        phase: "map_processing",
        progress: 30,
        totalMapTasks: args.totalMapTasks,
        completedMapTasks: 0,
        mapResults: {},
        questionCount: args.questionCount,
        difficulty: args.difficulty,
        questionType: args.questionType,
        focus: args.focus,
      },
    });
    return args.writtenQuestionId;
  },
});

export const storeWrittenQuestionsMapResult = internalMutation({
  args: {
    writtenQuestionId: v.id("writtenQuestions"),
    chunkIndex: v.number(),
    result: v.string(),
  },
  handler: async (ctx, args) => {
    const writtenQuestion = await ctx.db.get(args.writtenQuestionId);
    if (!writtenQuestion) return null;

    const existingResults = writtenQuestion.metadata?.mapResults || {};
    const updatedResults = {
      ...existingResults,
      [args.chunkIndex]: args.result,
    };

    const completedCount = Object.keys(updatedResults).length;
    const totalCount = writtenQuestion.metadata?.totalMapTasks || 0;

    await ctx.db.patch(args.writtenQuestionId, {
      updatedAt: Date.now(),
      metadata: {
        ...writtenQuestion.metadata,
        mapResults: updatedResults,
        completedMapTasks: completedCount,
        progress: 30 + Math.floor((completedCount / totalCount) * 30),
      },
    });
    return args.writtenQuestionId;
  },
});

export const clearWrittenQuestionsMapData = internalMutation({
  args: {
    writtenQuestionId: v.id("writtenQuestions"),
  },
  handler: async (ctx, args) => {
    const writtenQuestion = await ctx.db.get(args.writtenQuestionId);
    if (!writtenQuestion) return null;

    const { mapResults: _mapResults, ...restMetadata } =writtenQuestion.metadata || {};
    await ctx.db.patch(args.writtenQuestionId, {
      updatedAt: Date.now(),
      metadata: restMetadata,
    });
    return args.writtenQuestionId;
  },
});

// ============================================================
// REPORT HELPERS
// ============================================================

export const saveReportResults = internalMutation({
  args: {
    reportId: v.id("reports"),
    content: v.any(),
    metadata: v.any(),
  },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) return null;

    await ctx.db.patch(args.reportId, {
      content: args.content,
      status: "completed",
      updatedAt: Date.now(),
      title: args.metadata?.title ?? "Report",
      metadata: {
        ...args.metadata,
        completedAt: Date.now(),
      },
    });
    return args.reportId;
  },
});

export const updateReportTitle = internalMutation({
  args: {
    reportId: v.id("reports"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) return null;

    await ctx.db.patch(args.reportId, {
      title: args.title,
      updatedAt: Date.now(),
    });
    return args.reportId;
  },
});

export const updateReportStatus = internalMutation({
  args: {
    reportId: v.id("reports"),
    status: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: any = {
      status: args.status,
      updatedAt: Date.now(),
    };
    if (args.metadata) {
      updates.metadata = args.metadata;
    }
    await ctx.db.patch(args.reportId, updates);
    return args.reportId;
  },
});

export const markReportFailed = internalMutation({
  args: {
    reportId: v.id("reports"),
    error: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { reportId, error, metadata } = args;
    const report = await ctx.db.get(reportId);
    if (!report) return null;

    const errorMetadata = buildErrorMetadata(
      error,
      metadata?.errorPhase || metadata?.phase || "unknown",
      metadata
    );

    await ctx.db.patch(reportId, {
      status: "failed",
      updatedAt: Date.now(),
      metadata: {
        ...metadata,
        ...errorMetadata,
      },
    });
    return reportId;
  },
});

// Multi-phase report helpers
export const initReportMapPhase = internalMutation({
  args: {
    reportId: v.id("reports"),
    totalMapTasks: v.number(),
    reportType: v.string(),
    customPrompt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) return null;

    await ctx.db.patch(args.reportId, {
      status: "generating",
      updatedAt: Date.now(),
      metadata: {
        ...report.metadata,
        phase: "map_processing",
        progress: 30,
        totalMapTasks: args.totalMapTasks,
        completedMapTasks: 0,
        mapResults: {},
        reportType: args.reportType,
        customPrompt: args.customPrompt,
      },
    });
    return args.reportId;
  },
});

export const storeReportMapResult = internalMutation({
  args: {
    reportId: v.id("reports"),
    chunkIndex: v.number(),
    result: v.string(),
  },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) return null;

    const existingResults = report.metadata?.mapResults || {};
    const updatedResults = {
      ...existingResults,
      [args.chunkIndex]: args.result,
    };

    const completedCount = Object.keys(updatedResults).length;
    const totalCount = report.metadata?.totalMapTasks || 0;

    await ctx.db.patch(args.reportId, {
      updatedAt: Date.now(),
      metadata: {
        ...report.metadata,
        mapResults: updatedResults,
        completedMapTasks: completedCount,
        progress: 30 + Math.floor((completedCount / totalCount) * 30),
      },
    });
    return args.reportId;
  },
});

export const clearReportMapData = internalMutation({
  args: {
    reportId: v.id("reports"),
  },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) return null;

    const { packedChunks: _packedChunks, mapResults: _mapResults, ...restMetadata } =report.metadata || {};
    await ctx.db.patch(args.reportId, {
      updatedAt: Date.now(),
      metadata: restMetadata,
    });
    return args.reportId;
  },
});

// ============================================================
// MINDMAP HELPERS
// ============================================================

export const saveMindMapResults = internalMutation({
  args: {
    mindmapId: v.id("mindmaps"),
    mindmap: v.any(),
    metadata: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.mindmapId, {
      data: args.mindmap,
      status: "completed",
      updatedAt: Date.now(),
      title: args.metadata?.title ?? "Mind Map",
      metadata: {
        ...args.metadata,
        completedAt: Date.now(),
      },
    });
  },
});

export const updateMindMapTitle = internalMutation({
  args: {
    mindmapId: v.id("mindmaps"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.mindmapId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

export const updateMindMapStatus = internalMutation({
  args: {
    mindmapId: v.id("mindmaps"),
    status: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: any = {
      status: args.status,
      updatedAt: Date.now(),
    };
    if (args.metadata) {
      updates.metadata = args.metadata;
    }
    await ctx.db.patch(args.mindmapId, updates);
  },
});

export const markMindMapFailed = internalMutation({
  args: {
    mindmapId: v.id("mindmaps"),
    error: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const errorMetadata = buildErrorMetadata(
      args.error,
      args.metadata?.phase || "unknown",
      args.metadata
    );
    await ctx.db.patch(args.mindmapId, {
      status: "failed",
      updatedAt: Date.now(),
      metadata: {
        ...args.metadata,
        ...errorMetadata,
      },
    });
  },
});

// Multi-phase mindmap helpers
export const initMindMapMapPhase = internalMutation({
  args: {
    mindmapId: v.id("mindmaps"),
    totalMapTasks: v.number(),
  },
  handler: async (ctx, args) => {
    const mindmap = await ctx.db.get(args.mindmapId);
    if (!mindmap) return null;

    await ctx.db.patch(args.mindmapId, {
      status: "generating",
      updatedAt: Date.now(),
      metadata: {
        ...mindmap.metadata,
        phase: "map_processing",
        progress: 30,
        totalMapTasks: args.totalMapTasks,
        completedMapTasks: 0,
        mapResults: {},
      },
    });
    return args.mindmapId;
  },
});

export const storeMindMapMapResult = internalMutation({
  args: {
    mindmapId: v.id("mindmaps"),
    chunkIndex: v.number(),
    result: v.string(),
  },
  handler: async (ctx, args) => {
    const mindmap = await ctx.db.get(args.mindmapId);
    if (!mindmap) return null;

    const existingResults = mindmap.metadata?.mapResults || {};
    const updatedResults = {
      ...existingResults,
      [args.chunkIndex]: args.result,
    };

    const completedCount = Object.keys(updatedResults).length;
    const totalCount = mindmap.metadata?.totalMapTasks || 0;

    await ctx.db.patch(args.mindmapId, {
      updatedAt: Date.now(),
      metadata: {
        ...mindmap.metadata,
        mapResults: updatedResults,
        completedMapTasks: completedCount,
        progress: 30 + Math.floor((completedCount / totalCount) * 30),
      },
    });
    return args.mindmapId;
  },
});

export const clearMindMapMapData = internalMutation({
  args: {
    mindmapId: v.id("mindmaps"),
  },
  handler: async (ctx, args) => {
    const mindmap = await ctx.db.get(args.mindmapId);
    if (!mindmap) return null;

    const { mapResults: _mapResults, ...restMetadata } =mindmap.metadata || {};
    await ctx.db.patch(args.mindmapId, {
      updatedAt: Date.now(),
      metadata: restMetadata,
    });
    return args.mindmapId;
  },
});

// ============================================================
// SPREADSHEET HELPERS
// ============================================================

export const saveSpreadsheetResults = internalMutation({
  args: {
    spreadsheetId: v.id("spreadsheets"),
    spreadsheet: v.any(),
    metadata: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.spreadsheetId, {
      data: args.spreadsheet,
      status: "completed",
      updatedAt: Date.now(),
      title: args.metadata?.title ?? "Spreadsheet",
      metadata: {
        ...args.metadata,
        completedAt: Date.now(),
      },
    });
  },
});

export const updateSpreadsheetTitle = internalMutation({
  args: {
    spreadsheetId: v.id("spreadsheets"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.spreadsheetId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

export const updateSpreadsheetStatus = internalMutation({
  args: {
    spreadsheetId: v.id("spreadsheets"),
    status: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: any = {
      status: args.status,
      updatedAt: Date.now(),
    };
    if (args.metadata) {
      updates.metadata = args.metadata;
    }
    await ctx.db.patch(args.spreadsheetId, updates);
  },
});

export const markSpreadsheetFailed = internalMutation({
  args: {
    spreadsheetId: v.id("spreadsheets"),
    error: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const errorMetadata = buildErrorMetadata(
      args.error,
      args.metadata?.phase || "unknown",
      args.metadata
    );
    await ctx.db.patch(args.spreadsheetId, {
      status: "failed",
      updatedAt: Date.now(),
      metadata: {
        ...args.metadata,
        ...errorMetadata,
      },
    });
  },
});

// Multi-phase spreadsheet helpers
export const initSpreadsheetMapPhase = internalMutation({
  args: {
    spreadsheetId: v.id("spreadsheets"),
    totalMapTasks: v.number(),
    spreadsheetType: v.optional(v.string()),
    customPrompt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const spreadsheet = await ctx.db.get(args.spreadsheetId);
    if (!spreadsheet) return null;

    await ctx.db.patch(args.spreadsheetId, {
      status: "generating",
      updatedAt: Date.now(),
      metadata: {
        ...spreadsheet.metadata,
        phase: "map_processing",
        progress: 30,
        totalMapTasks: args.totalMapTasks,
        completedMapTasks: 0,
        mapResults: {},
        spreadsheetType: args.spreadsheetType || "custom",
        customPrompt: args.customPrompt,
      },
    });
    return args.spreadsheetId;
  },
});

export const storeSpreadsheetMapResult = internalMutation({
  args: {
    spreadsheetId: v.id("spreadsheets"),
    chunkIndex: v.number(),
    result: v.string(),
  },
  handler: async (ctx, args) => {
    const spreadsheet = await ctx.db.get(args.spreadsheetId);
    if (!spreadsheet) return null;

    const existingResults = spreadsheet.metadata?.mapResults || {};
    const updatedResults = {
      ...existingResults,
      [args.chunkIndex]: args.result,
    };

    const completedCount = Object.keys(updatedResults).length;
    const totalCount = spreadsheet.metadata?.totalMapTasks || 0;

    await ctx.db.patch(args.spreadsheetId, {
      updatedAt: Date.now(),
      metadata: {
        ...spreadsheet.metadata,
        mapResults: updatedResults,
        completedMapTasks: completedCount,
        progress: 30 + Math.floor((completedCount / totalCount) * 30),
      },
    });
    return args.spreadsheetId;
  },
});

export const clearSpreadsheetMapData = internalMutation({
  args: {
    spreadsheetId: v.id("spreadsheets"),
  },
  handler: async (ctx, args) => {
    const spreadsheet = await ctx.db.get(args.spreadsheetId);
    if (!spreadsheet) return null;

    const { mapResults: _mapResults, ...restMetadata } =spreadsheet.metadata || {};
    await ctx.db.patch(args.spreadsheetId, {
      updatedAt: Date.now(),
      metadata: restMetadata,
    });
    return args.spreadsheetId;
  },
});

// ============================================================
// AUDIO OVERVIEW HELPERS
// ============================================================

export const saveAudioOverviewResults = internalMutation({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    audioUrl: v.string(),
    transcript: v.string(),
    metadata: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.audioOverviewId, {
      transcript: args.transcript,
      audioUrl: args.audioUrl,
      status: "completed",
      updatedAt: Date.now(),
      title: args.metadata?.title ?? "Audio Overview",
      metadata: {
        ...args.metadata,
        completedAt: Date.now(),
      },
    });
  },
});

export const updateAudioOverviewTitle = internalMutation({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.audioOverviewId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

export const updateAudioOverviewStatus = internalMutation({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    status: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: any = {
      status: args.status,
      updatedAt: Date.now(),
    };
    if (args.metadata) {
      updates.metadata = args.metadata;
    }
    await ctx.db.patch(args.audioOverviewId, updates);
  },
});

export const markAudioOverviewFailed = internalMutation({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    error: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const errorMetadata = buildErrorMetadata(
      args.error,
      args.metadata?.phase || "unknown",
      args.metadata
    );
    await ctx.db.patch(args.audioOverviewId, {
      status: "failed",
      updatedAt: Date.now(),
      metadata: {
        ...args.metadata,
        ...errorMetadata,
      },
    });
  },
});

// Multi-phase audio overview helpers
export const initAudioOverviewMapPhase = internalMutation({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    totalMapTasks: v.number(),
  },
  handler: async (ctx, args) => {
    const audioOverview = await ctx.db.get(args.audioOverviewId);
    if (!audioOverview) return null;

    await ctx.db.patch(args.audioOverviewId, {
      status: "generating",
      updatedAt: Date.now(),
      metadata: {
        ...audioOverview.metadata,
        phase: "map_processing",
        progress: 30,
        totalMapTasks: args.totalMapTasks,
        completedMapTasks: 0,
        mapResults: {},
      },
    });
    return args.audioOverviewId;
  },
});

export const storeAudioOverviewMapResult = internalMutation({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    chunkIndex: v.number(),
    result: v.string(),
  },
  handler: async (ctx, args) => {
    const audioOverview = await ctx.db.get(args.audioOverviewId);
    if (!audioOverview) return null;

    const existingResults = audioOverview.metadata?.mapResults || {};
    const updatedResults = {
      ...existingResults,
      [args.chunkIndex]: args.result,
    };

    const completedCount = Object.keys(updatedResults).length;
    const totalCount = audioOverview.metadata?.totalMapTasks || 0;

    await ctx.db.patch(args.audioOverviewId, {
      updatedAt: Date.now(),
      metadata: {
        ...audioOverview.metadata,
        mapResults: updatedResults,
        completedMapTasks: completedCount,
        progress: 30 + Math.floor((completedCount / totalCount) * 30),
      },
    });
    return args.audioOverviewId;
  },
});

export const clearAudioOverviewMapData = internalMutation({
  args: {
    audioOverviewId: v.id("audioOverviews"),
  },
  handler: async (ctx, args) => {
    const audioOverview = await ctx.db.get(args.audioOverviewId);
    if (!audioOverview) return null;

    const { mapResults: _mapResults, ...restMetadata } =audioOverview.metadata || {};
    await ctx.db.patch(args.audioOverviewId, {
      updatedAt: Date.now(),
      metadata: restMetadata,
    });
    return args.audioOverviewId;
  },
});
