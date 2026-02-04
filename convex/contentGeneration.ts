"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "./auth";

interface ScheduleReportResult {
  reportId: string;
  status: string;
  report: { _id: string; title: string; status: string };
}

/**
 * Public API: Schedule a report generation
 */
export const scheduleReport = action({
  args: {
    notebookId: v.id("notebooks"),
    documentIds: v.optional(v.array(v.id("documents"))),
    reportType: v.optional(v.string()),
    customPrompt: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ScheduleReportResult> => {
    // Get user ID from session
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    // Check daily report limit
    await ctx.runMutation(internal.lib.limits.checkDailyLimitInternal, {
      userId,
      feature: "report",
    });

    const documentIds = args.documentIds ?? [];
    if (documentIds.length === 0) {
      throw new Error("Please select at least one source. Content generation uses only your selected sources.");
    }

    // Create the report first (use internal mutation per Convex best practices)
    const report = await ctx.runMutation(internal.reports.createInternal, {
      userId,
      notebookId: args.notebookId,
      title: "Report",
      reportType: args.reportType || "summary",
      metadata: {
        status: "generating",
        documentIds,
      },
    });
    if (!report) {
      throw new Error("Failed to create report");
    }
    const reportId = report._id;

    // Schedule the job directly — uses only the provided (selected) document IDs
    await ctx.scheduler.runAfter(0, internal.jobs.ReportGenerationJob.reportGeneration, {
      reportId,
      userId,
      notebookId: args.notebookId,
      documentIds,
      reportType: args.reportType || "summary",
      customPrompt: args.customPrompt,
    });

    return { reportId, status: "generating", report: { _id: reportId, title: "Report", status: "generating" } };
  },
});

interface ScheduleFlashcardsResult {
  flashcardId: string;
  status: string;
  flashcard: { _id: string; title: string; status: string };
}

/**
 * Public API: Schedule a flashcard generation
 */
export const scheduleFlashcards = action({
  args: {
    notebookId: v.id("notebooks"),
    documentIds: v.optional(v.array(v.id("documents"))),
    cardCount: v.optional(v.number()),
    difficulty: v.optional(v.string()),
    topic: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ScheduleFlashcardsResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    // Check daily flashcard limit
    await ctx.runMutation(internal.lib.limits.checkDailyLimitInternal, {
      userId,
      feature: "flashcard",
    });

    const documentIds = args.documentIds ?? [];
    if (documentIds.length === 0) {
      throw new Error("Please select at least one source. Content generation uses only your selected sources.");
    }

    const flashcard = await ctx.runMutation(internal.flashcards.createInternal, {
      userId,
      notebookId: args.notebookId,
      title: "Flashcards",
      metadata: {
        difficulty: args.difficulty || "medium",
        cardCount: args.cardCount || 35,
        topic: args.topic,
        documentIds,
      },
    });
    if (!flashcard) {
      throw new Error("Failed to create flashcard");
    }
    const flashcardId = flashcard._id;

    // Schedule the job directly — uses only the provided (selected) document IDs
    await ctx.scheduler.runAfter(0, internal.jobs.FlashcardGenerationJob.flashcardGeneration, {
      flashcardId,
      userId,
      notebookId: args.notebookId,
      documentIds,
      cardCount: args.cardCount || 35,
      difficulty: args.difficulty || "medium",
      topic: args.topic,
    });

    return { flashcardId, status: "generating", flashcard: { _id: flashcardId, title: "Flashcards", status: "generating" } };
  },
});

interface ScheduleQuizResult {
  quizId: string;
  status: string;
  quiz: { _id: string; title: string; status: string };
}

/**
 * Public API: Schedule a quiz generation
 */
export const scheduleQuiz = action({
  args: {
    notebookId: v.id("notebooks"),
    documentIds: v.optional(v.array(v.id("documents"))),
    questionCount: v.optional(v.number()),
    difficulty: v.optional(v.string()),
    focus: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ScheduleQuizResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    // Check daily quiz limit
    await ctx.runMutation(internal.lib.limits.checkDailyLimitInternal, {
      userId,
      feature: "quiz",
    });

    const documentIds = args.documentIds ?? [];
    if (documentIds.length === 0) {
      throw new Error("Please select at least one source. Content generation uses only your selected sources.");
    }

    const quiz = await ctx.runMutation(internal.quizzes.createInternal, {
      userId,
      notebookId: args.notebookId,
      title: "Quiz",
      metadata: {
        difficulty: args.difficulty || "medium",
        questionCount: args.questionCount || 10,
        focus: args.focus,
        documentIds,
      },
    });
    if (!quiz) {
      throw new Error("Failed to create quiz");
    }
    const quizId = quiz._id;

    // Schedule the job directly — uses only the provided (selected) document IDs
    await ctx.scheduler.runAfter(0, internal.jobs.QuizGenerationJob.quizGeneration, {
      quizId,
      userId,
      notebookId: args.notebookId,
      documentIds,
      questionCount: args.questionCount || 10,
      difficulty: args.difficulty || "medium",
      focus: args.focus,
    });

    return { quizId, status: "generating", quiz: { _id: quizId, title: "Quiz", status: "generating" } };
  },
});

interface ScheduleWrittenQuestionsResult {
  writtenQuestionId: string;
  status: string;
  writtenQuestion: { _id: string; title: string; status: string };
}

/**
 * Public API: Schedule written questions generation
 */
export const scheduleWrittenQuestions = action({
  args: {
    notebookId: v.id("notebooks"),
    documentIds: v.optional(v.array(v.id("documents"))),
    questionCount: v.optional(v.number()),
    difficulty: v.optional(v.string()),
    questionType: v.optional(v.string()),
    focus: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ScheduleWrittenQuestionsResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    // Check daily written question limit
    await ctx.runMutation(internal.lib.limits.checkDailyLimitInternal, {
      userId,
      feature: "writtenQuestion",
    });

    const documentIds = args.documentIds ?? [];
    if (documentIds.length === 0) {
      throw new Error("Please select at least one source. Content generation uses only your selected sources.");
    }

    const writtenQuestion = await ctx.runMutation(internal.writtenQuestions.createInternal, {
      userId,
      notebookId: args.notebookId,
      title: "Written Questions",
      questionType: args.questionType || "short",
      metadata: {
        difficulty: args.difficulty || "medium",
        questionCount: args.questionCount || 10,
        focus: args.focus,
        documentIds,
      },
    });
    if (!writtenQuestion) {
      throw new Error("Failed to create written question");
    }
    const writtenQuestionId = writtenQuestion._id;

    // Schedule the job directly — uses only the provided (selected) document IDs
    await ctx.scheduler.runAfter(0, internal.jobs.WrittenQuestionsGenerationJob.writtenQuestionsGeneration, {
      writtenQuestionId,
      userId,
      notebookId: args.notebookId,
      documentIds,
      questionCount: args.questionCount || 10,
      difficulty: args.difficulty || "medium",
      questionType: args.questionType || "short",
      focus: args.focus,
    });

    return { writtenQuestionId, status: "generating", writtenQuestion: { _id: writtenQuestionId, title: "Written Questions", status: "generating" } };
  },
});

interface ScheduleSpreadsheetResult {
  spreadsheetId: string;
  status: string;
  spreadsheet: { _id: string; title: string; status: string };
}

/**
 * Public API: Schedule a spreadsheet generation
 */
export const scheduleSpreadsheet = action({
  args: {
    notebookId: v.id("notebooks"),
    documentIds: v.optional(v.array(v.id("documents"))),
    title: v.optional(v.string()),
    spreadsheetType: v.optional(v.string()),
    customPrompt: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ScheduleSpreadsheetResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    // Check daily spreadsheet limit
    await ctx.runMutation(internal.lib.limits.checkDailyLimitInternal, {
      userId,
      feature: "spreadsheet",
    });

    const documentIds = args.documentIds ?? [];
    if (documentIds.length === 0) {
      throw new Error("Please select at least one source. Content generation uses only your selected sources.");
    }

    const spreadsheet = await ctx.runMutation(internal.spreadsheets.createInternal, {
      userId,
      notebookId: args.notebookId,
      title: args.title || "Spreadsheet",
      spreadsheetType: args.spreadsheetType || "custom",
      customPrompt: args.customPrompt || "",
      metadata: {
        status: "generating",
        documentIds,
      },
    });
    if (!spreadsheet) {
      throw new Error("Failed to create spreadsheet");
    }
    const spreadsheetId = spreadsheet._id;

    // Schedule the job directly — uses only the provided (selected) document IDs
    await ctx.scheduler.runAfter(0, internal.jobs.SpreadsheetGenerationJob.spreadsheetGeneration, {
      spreadsheetId,
      userId,
      notebookId: args.notebookId,
      documentIds,
      spreadsheetType: args.spreadsheetType || "custom",
      customPrompt: args.customPrompt,
    });

    return { spreadsheetId, status: "generating", spreadsheet };
  },
});
