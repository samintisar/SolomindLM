import { internalMutation } from '../_generated/server';
import { v } from 'convex/values';

/**
 * Update the status of a document processing job
 */
export const updateDocumentJobStatus = internalMutation({
  args: {
    documentId: v.id('documents'),
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

/**
 * Mark a document job as failed
 */
export const markDocumentJobFailed = internalMutation({
  args: {
    documentId: v.id('documents'),
    error: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { documentId, error, metadata } = args;

    await ctx.db.patch(documentId, {
      status: 'failed',
      error,
      metadata: {
        ...metadata,
        failedAt: Date.now(),
      },
    });
  },
});

/**
 * Update flashcard title
 */
export const updateFlashcardTitle = internalMutation({
  args: {
    flashcardId: v.id('flashcards'),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.flashcardId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Save flashcard generation results
 */
export const saveFlashcardResults = internalMutation({
  args: {
    flashcardId: v.id('flashcards'),
    flashcards: v.array(v.any()),
    metadata: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.flashcardId, {
      cardsData: args.flashcards,
      status: 'completed',
      updatedAt: Date.now(),
      title: args.metadata?.title ?? 'Flashcards',
      metadata: {
        ...args.metadata,
        cardCount: args.flashcards.length,
        completedAt: Date.now(),
      },
    });
  },
});

/**
 * Update flashcard job status
 */
export const updateFlashcardStatus = internalMutation({
  args: {
    flashcardId: v.id('flashcards'),
    status: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
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

/**
 * Mark flashcard job as failed
 */
export const markFlashcardFailed = internalMutation({
  args: {
    flashcardId: v.id('flashcards'),
    error: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.flashcardId, {
      status: 'failed',
      updatedAt: Date.now(),
      metadata: {
        error: args.error,
        failedAt: Date.now(),
        ...args.metadata,
      },
    });
  },
});

/**
 * Save quiz generation results
 */
export const saveQuizResults = internalMutation({
  args: {
    quizId: v.id('quizzes'),
    questions: v.array(v.any()),
    metadata: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.quizId, {
      questionsData: args.questions,
      status: 'completed',
      updatedAt: Date.now(),
      title: args.metadata?.title ?? 'Quiz',
      metadata: {
        ...args.metadata,
        questionCount: args.questions.length,
        completedAt: Date.now(),
      },
    });
  },
});

/**
 * Update quiz title
 */
export const updateQuizTitle = internalMutation({
  args: {
    quizId: v.id('quizzes'),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.quizId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update quiz job status
 */
export const updateQuizStatus = internalMutation({
  args: {
    quizId: v.id('quizzes'),
    status: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
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

/**
 * Mark quiz job as failed
 */
export const markQuizFailed = internalMutation({
  args: {
    quizId: v.id('quizzes'),
    error: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.quizId, {
      status: 'failed',
      updatedAt: Date.now(),
      metadata: {
        error: args.error,
        failedAt: Date.now(),
        ...args.metadata,
      },
    });
  },
});

/**
 * Update written questions title
 */
export const updateWrittenQuestionsTitle = internalMutation({
  args: {
    writtenQuestionId: v.id('writtenQuestions'),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.writtenQuestionId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Save written questions generation results
 */
export const saveWrittenQuestionsResults = internalMutation({
  args: {
    writtenQuestionId: v.id('writtenQuestions'),
    questions: v.array(v.any()),
    metadata: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.writtenQuestionId, {
      questionsData: args.questions,
      status: 'completed',
      updatedAt: Date.now(),
      title: args.metadata?.title ?? 'Written Questions',
      metadata: {
        ...args.metadata,
        questionCount: args.questions.length,
        completedAt: Date.now(),
      },
    });
  },
});

/**
 * Update written questions job status
 */
export const updateWrittenQuestionsStatus = internalMutation({
  args: {
    writtenQuestionId: v.id('writtenQuestions'),
    status: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
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

/**
 * Mark written questions job as failed
 */
export const markWrittenQuestionsFailed = internalMutation({
  args: {
    writtenQuestionId: v.id('writtenQuestions'),
    error: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.writtenQuestionId, {
      status: 'failed',
      updatedAt: Date.now(),
      metadata: {
        error: args.error,
        failedAt: Date.now(),
        ...args.metadata,
      },
    });
  },
});

/**
 * Save report generation results
 */
export const saveReportResults = internalMutation({
  args: {
    reportId: v.id('reports'),
    content: v.any(),
    metadata: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.reportId, {
      content: args.content,
      status: 'completed',
      updatedAt: Date.now(),
      title: args.metadata?.title ?? 'Study Report',
      metadata: {
        ...args.metadata,
        completedAt: Date.now(),
      },
    });
  },
});

/**
 * Update report title
 */
export const updateReportTitle = internalMutation({
  args: {
    reportId: v.id('reports'),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.reportId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update report job status
 */
export const updateReportStatus = internalMutation({
  args: {
    reportId: v.id('reports'),
    status: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const updates: any = {
      status: args.status,
      updatedAt: Date.now(),
    };
    if (args.metadata) {
      updates.metadata = args.metadata;
    }
    await ctx.db.patch(args.reportId, updates);
  },
});

/**
 * Mark report job as failed
 */
export const markReportFailed = internalMutation({
  args: {
    reportId: v.id('reports'),
    error: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.reportId, {
      status: 'failed',
      updatedAt: Date.now(),
      metadata: {
        error: args.error,
        failedAt: Date.now(),
        ...args.metadata,
      },
    });
  },
});

/**
 * Save mindmap generation results
 */
export const saveMindMapResults = internalMutation({
  args: {
    mindmapId: v.id('mindmaps'),
    mindmap: v.any(),
    metadata: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.mindmapId, {
      data: args.mindmap,
      status: 'completed',
      updatedAt: Date.now(),
      title: args.metadata?.title ?? 'Mind Map',
      metadata: {
        ...args.metadata,
        completedAt: Date.now(),
      },
    });
  },
});

/**
 * Update mindmap title
 */
export const updateMindMapTitle = internalMutation({
  args: {
    mindmapId: v.id('mindmaps'),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.mindmapId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update mindmap job status
 */
export const updateMindMapStatus = internalMutation({
  args: {
    mindmapId: v.id('mindmaps'),
    status: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
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

/**
 * Mark mindmap job as failed
 */
export const markMindMapFailed = internalMutation({
  args: {
    mindmapId: v.id('mindmaps'),
    error: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.mindmapId, {
      status: 'failed',
      updatedAt: Date.now(),
      metadata: {
        error: args.error,
        failedAt: Date.now(),
        ...args.metadata,
      },
    });
  },
});

/**
 * Save slide deck generation results
 */
export const saveSlideDeckResults = internalMutation({
  args: {
    slideDeckId: v.id('slides'),
    slides: v.array(v.any()),
    metadata: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.slideDeckId, {
      data: args.slides,
      status: 'completed',
      slideCount: args.slides.length,
      updatedAt: Date.now(),
      title: args.metadata?.title ?? 'Slide Deck',
      metadata: {
        ...args.metadata,
        completedAt: Date.now(),
      },
    });
  },
});

/**
 * Update slide deck title
 */
export const updateSlideDeckTitle = internalMutation({
  args: {
    slideDeckId: v.id('slides'),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.slideDeckId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update slide deck job status
 */
export const updateSlideDeckStatus = internalMutation({
  args: {
    slideDeckId: v.id('slides'),
    status: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const updates: any = {
      status: args.status,
      updatedAt: Date.now(),
    };
    if (args.metadata) {
      updates.metadata = args.metadata;
    }
    await ctx.db.patch(args.slideDeckId, updates);
  },
});

/**
 * Mark slide deck job as failed
 */
export const markSlideDeckFailed = internalMutation({
  args: {
    slideDeckId: v.id('slides'),
    error: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.slideDeckId, {
      status: 'failed',
      updatedAt: Date.now(),
      metadata: {
        error: args.error,
        failedAt: Date.now(),
        ...args.metadata,
      },
    });
  },
});

/**
 * Save spreadsheet generation results
 */
export const saveSpreadsheetResults = internalMutation({
  args: {
    spreadsheetId: v.id('spreadsheets'),
    spreadsheet: v.any(),
    metadata: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.spreadsheetId, {
      data: args.spreadsheet,
      status: 'completed',
      updatedAt: Date.now(),
      title: args.metadata?.title ?? 'Spreadsheet',
      metadata: {
        ...args.metadata,
        completedAt: Date.now(),
      },
    });
  },
});

/**
 * Update spreadsheet title
 */
export const updateSpreadsheetTitle = internalMutation({
  args: {
    spreadsheetId: v.id('spreadsheets'),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.spreadsheetId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update spreadsheet job status
 */
export const updateSpreadsheetStatus = internalMutation({
  args: {
    spreadsheetId: v.id('spreadsheets'),
    status: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
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

/**
 * Mark spreadsheet job as failed
 */
export const markSpreadsheetFailed = internalMutation({
  args: {
    spreadsheetId: v.id('spreadsheets'),
    error: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.spreadsheetId, {
      status: 'failed',
      updatedAt: Date.now(),
      metadata: {
        error: args.error,
        failedAt: Date.now(),
        ...args.metadata,
      },
    });
  },
});

/**
 * Save audio overview generation results
 */
export const saveAudioOverviewResults = internalMutation({
  args: {
    audioOverviewId: v.id('audioOverviews'),
    audioUrl: v.string(),
    transcript: v.string(),
    metadata: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.audioOverviewId, {
      transcript: args.transcript,
      audioUrl: args.audioUrl,
      status: 'completed',
      updatedAt: Date.now(),
      title: args.metadata?.title ?? 'Audio Overview',
      metadata: {
        ...args.metadata,
        completedAt: Date.now(),
      },
    });
  },
});

/**
 * Update audio overview title
 */
export const updateAudioOverviewTitle = internalMutation({
  args: {
    audioOverviewId: v.id('audioOverviews'),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.audioOverviewId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update audio overview job status
 */
export const updateAudioOverviewStatus = internalMutation({
  args: {
    audioOverviewId: v.id('audioOverviews'),
    status: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
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

/**
 * Mark audio overview job as failed
 */
export const markAudioOverviewFailed = internalMutation({
  args: {
    audioOverviewId: v.id('audioOverviews'),
    error: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.audioOverviewId, {
      status: 'failed',
      updatedAt: Date.now(),
      metadata: {
        error: args.error,
        failedAt: Date.now(),
        ...args.metadata,
      },
    });
  },
});
