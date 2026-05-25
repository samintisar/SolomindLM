/**
 * Convex actions for running studio agents (reports, flashcards, quizzes, …)
 * in eval mode against a fixed notebook.
 *
 * Each action:
 *   1. Gates on RAG_EVALS_ENABLED + RAG_EVAL_SECRET (see `_gate.ts`).
 *   2. Resolves identity from the notebook owner — never trusts caller-supplied userId.
 *   3. If documentIds is empty, fills it with all docs in the notebook (studio
 *      schedulers reject empty documentIds, so the eval has to provide them).
 *   4. Creates the studio row via `internal.studio.<type>.index.createInternal`.
 *   5. Drives generation inline via `ctx.runAction(internal.studio.<type>.job.<type>Generation, …)`.
 *   6. Reads the populated row back and returns the structured payload + latency.
 *
 * Mirrors the inline-driven pattern of [chatEvalAction.ts](./chatEvalAction.ts).
 */
"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id, DataModel } from "../_generated/dataModel";
import type { GenericActionCtx } from "convex/server";
import { v } from "convex/values";
import { assertRagEvalGate } from "./_gate";

type EvalActionCtx = GenericActionCtx<DataModel>;

// ─── Shared helpers ──────────────────────────────────────────

interface NotebookOwner {
  userId: Id<"users">;
}

async function resolveNotebookOwner(
  ctx: EvalActionCtx,
  notebookId: Id<"notebooks">
): Promise<NotebookOwner> {
  const notebook = await ctx.runQuery(internal.notebooks.index.getNotebookInternal, {
    notebookId,
  });
  if (!notebook) {
    throw new Error(
      `Notebook ${notebookId} not found on this Convex deployment. ` +
        `Verify RAG_EVAL_CONVEX_URL points at the deployment that owns this notebook ` +
        `(IDs do not transfer across deployments).`
    );
  }
  return { userId: notebook.userId as Id<"users"> };
}

async function resolveDocumentIds(
  ctx: EvalActionCtx,
  notebookId: Id<"notebooks">,
  userId: Id<"users">,
  provided?: Id<"documents">[]
): Promise<Id<"documents">[]> {
  if (provided && provided.length > 0) return provided;
  const docs = await ctx.runQuery(internal.documents.internal.listDocumentsForNotebookReadInternal, {
    notebookId,
    userId,
  });
  const ids = (docs as Array<{ _id: Id<"documents"> }>).map((d) => d._id);
  if (ids.length === 0) {
    throw new Error(
      `Notebook ${notebookId} has no documents — studio agents require at least one source.`
    );
  }
  return ids;
}

// Studio jobs chain phases via `ctx.scheduler.runAfter`, so the kickoff
// action returns long before the row is populated. The eval needs to wait
// for the row to reach a terminal status before reading it.
const TERMINAL_STATUSES: ReadonlySet<string> = new Set(["completed", "failed"]);
const POLL_INTERVAL_MS = 2000;
// Audio reduce alone is configured to allow up to 10 minutes of LLM time
// (AUDIO_REDUCE_TIMEOUT_MS), and a job can have multiple slow phases plus
// TTS. Keep the eval ceiling well above the total expected time.
const POLL_TIMEOUT_MS = 20 * 60 * 1000;

async function pollUntilTerminal<T extends { status?: string } | null>(
  ctx: EvalActionCtx,
  read: () => Promise<T>,
  label: string
): Promise<NonNullable<T>> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let last: T = await read();
  while (Date.now() < deadline) {
    if (last && last.status && TERMINAL_STATUSES.has(last.status)) {
      return last as NonNullable<T>;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    last = await read();
  }
  if (!last) {
    throw new Error(`${label}: row disappeared while polling for terminal status.`);
  }
  throw new Error(
    `${label}: timed out after ${POLL_TIMEOUT_MS}ms waiting for terminal status (last status: ${last.status ?? "unknown"}).`
  );
}

// ─── Reports ─────────────────────────────────────────────────

export interface ReportEvalKickoff {
  reportId: string;
  startedAt: number;
}

export interface ReportEvalStatus {
  status: string;
  title: string;
  content: unknown;
  reportType: string;
}

export const startReportEval = action({
  args: {
    evalSecret: v.string(),
    notebookId: v.id("notebooks"),
    documentIds: v.optional(v.array(v.id("documents"))),
    reportType: v.optional(v.string()),
    customPrompt: v.optional(v.string()),
    smartLlm: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ReportEvalKickoff> => {
    assertRagEvalGate(args.evalSecret);
    if (args.smartLlm !== undefined && args.smartLlm.trim() === "") {
      throw new Error("smartLlm must be a non-empty model identifier when provided");
    }
    const { userId } = await resolveNotebookOwner(ctx, args.notebookId);
    const documentIds = await resolveDocumentIds(ctx, args.notebookId, userId, args.documentIds);
    const reportType = args.reportType ?? "summary";

    const report = await ctx.runMutation(internal.studio.reports.index.createInternal, {
      userId,
      notebookId: args.notebookId,
      title: "Report (eval)",
      reportType,
      metadata: { status: "generating", documentIds, smartLlm: args.smartLlm },
    });
    if (!report) throw new Error("Failed to create report row for eval");
    const reportId = report._id as Id<"reports">;

    await ctx.scheduler.runAfter(0, internal.studio.reports.job.reportGeneration, {
      reportId,
      userId: userId as string,
      notebookId: args.notebookId,
      documentIds,
      reportType,
      customPrompt: args.customPrompt,
      smartLlm: args.smartLlm,
    });

    return { reportId: reportId as string, startedAt: Date.now() };
  },
});

export const getReportEvalStatus = action({
  args: { evalSecret: v.string(), reportId: v.id("reports") },
  handler: async (ctx, args): Promise<ReportEvalStatus> => {
    assertRagEvalGate(args.evalSecret);
    const populated = await ctx.runQuery(internal.studio.reports.index.getInternal, {
      id: args.reportId,
    });
    if (!populated) throw new Error(`Report ${args.reportId} not found`);
    return {
      status: populated.status,
      title: populated.title,
      content: populated.content,
      reportType: populated.reportType ?? "summary",
    };
  },
});

// ─── Flashcards ──────────────────────────────────────────────

export interface FlashcardsEvalKickoff {
  flashcardId: string;
  startedAt: number;
}

export interface FlashcardsEvalStatus {
  status: string;
  title: string;
  cards: Array<Record<string, unknown>>;
}

export const startFlashcardsEval = action({
  args: {
    evalSecret: v.string(),
    notebookId: v.id("notebooks"),
    documentIds: v.optional(v.array(v.id("documents"))),
    cardCount: v.optional(v.number()),
    difficulty: v.optional(v.string()),
    topic: v.optional(v.string()),
    smartLlm: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<FlashcardsEvalKickoff> => {
    assertRagEvalGate(args.evalSecret);
    if (args.smartLlm !== undefined && args.smartLlm.trim() === "") {
      throw new Error("smartLlm must be a non-empty model identifier when provided");
    }
    const { userId } = await resolveNotebookOwner(ctx, args.notebookId);
    const documentIds = await resolveDocumentIds(ctx, args.notebookId, userId, args.documentIds);

    const cardCount = args.cardCount ?? 35;
    const difficulty = args.difficulty ?? "medium";

    const flashcard = await ctx.runMutation(internal.studio.flashcards.index.createInternal, {
      userId,
      notebookId: args.notebookId,
      title: "Flashcards (eval)",
      metadata: { difficulty, cardCount, topic: args.topic, documentIds, smartLlm: args.smartLlm },
    });
    if (!flashcard) throw new Error("Failed to create flashcard row for eval");
    const flashcardId = flashcard._id as Id<"flashcards">;

    await ctx.scheduler.runAfter(0, internal.studio.flashcards.job.flashcardGeneration, {
      flashcardId,
      userId: userId as string,
      notebookId: args.notebookId,
      documentIds,
      cardCount,
      difficulty,
      topic: args.topic,
      smartLlm: args.smartLlm,
    });

    return { flashcardId: flashcardId as string, startedAt: Date.now() };
  },
});

export const getFlashcardsEvalStatus = action({
  args: { evalSecret: v.string(), flashcardId: v.id("flashcards") },
  handler: async (ctx, args): Promise<FlashcardsEvalStatus> => {
    assertRagEvalGate(args.evalSecret);
    const populated = await ctx.runQuery(internal.studio.flashcards.index.getInternal, {
      id: args.flashcardId,
    });
    if (!populated) throw new Error(`Flashcard ${args.flashcardId} not found`);
    return {
      status: populated.status,
      title: populated.title,
      cards: Array.isArray(populated.cardsData) ? populated.cardsData : [],
    };
  },
});

// ─── Quizzes ─────────────────────────────────────────────────

export interface QuizEvalKickoff {
  quizId: string;
  startedAt: number;
}

export interface QuizEvalStatus {
  status: string;
  title: string;
  questions: Array<Record<string, unknown>>;
}

export const startQuizEval = action({
  args: {
    evalSecret: v.string(),
    notebookId: v.id("notebooks"),
    documentIds: v.optional(v.array(v.id("documents"))),
    questionCount: v.optional(v.number()),
    difficulty: v.optional(v.string()),
    focus: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<QuizEvalKickoff> => {
    assertRagEvalGate(args.evalSecret);
    const { userId } = await resolveNotebookOwner(ctx, args.notebookId);
    const documentIds = await resolveDocumentIds(ctx, args.notebookId, userId, args.documentIds);
    const questionCount = args.questionCount ?? 10;
    const difficulty = args.difficulty ?? "medium";

    const quiz = await ctx.runMutation(internal.studio.quizzes.index.createInternal, {
      userId,
      notebookId: args.notebookId,
      title: "Quiz (eval)",
      metadata: { difficulty, questionCount, focus: args.focus, documentIds },
    });
    if (!quiz) throw new Error("Failed to create quiz row for eval");
    const quizId = quiz._id as Id<"quizzes">;

    await ctx.scheduler.runAfter(0, internal.studio.quizzes.job.quizGeneration, {
      quizId,
      userId: userId as string,
      notebookId: args.notebookId,
      documentIds,
      questionCount,
      difficulty,
      focus: args.focus,
    });

    return { quizId: quizId as string, startedAt: Date.now() };
  },
});

export const getQuizEvalStatus = action({
  args: { evalSecret: v.string(), quizId: v.id("quizzes") },
  handler: async (ctx, args): Promise<QuizEvalStatus> => {
    assertRagEvalGate(args.evalSecret);
    const populated = await ctx.runQuery(internal.studio.quizzes.index.getInternal, {
      id: args.quizId,
    });
    if (!populated) throw new Error(`Quiz ${args.quizId} not found`);
    return {
      status: populated.status,
      title: populated.title,
      questions: Array.isArray(populated.questionsData) ? populated.questionsData : [],
    };
  },
});

// ─── Mindmaps ────────────────────────────────────────────────

export interface MindmapEvalKickoff {
  mindmapId: string;
  startedAt: number;
}

export interface MindmapEvalStatus {
  status: string;
  title: string;
  data: unknown;
}

export const startMindmapEval = action({
  args: {
    evalSecret: v.string(),
    notebookId: v.id("notebooks"),
    documentIds: v.optional(v.array(v.id("documents"))),
  },
  handler: async (ctx, args): Promise<MindmapEvalKickoff> => {
    assertRagEvalGate(args.evalSecret);
    const { userId } = await resolveNotebookOwner(ctx, args.notebookId);
    const documentIds = await resolveDocumentIds(ctx, args.notebookId, userId, args.documentIds);

    const mindmapId = await ctx.runMutation(
      internal.eval._studioRowCreators.createMindmapInternal,
      {
        userId,
        notebookId: args.notebookId,
        title: "Mind Map (eval)",
      }
    );

    await ctx.scheduler.runAfter(0, internal.studio.mindmaps.job.mindmapGeneration, {
      mindmapId,
      userId: userId as string,
      notebookId: args.notebookId,
      documentIds,
    });

    return { mindmapId: mindmapId as string, startedAt: Date.now() };
  },
});

export const getMindmapEvalStatus = action({
  args: { evalSecret: v.string(), mindmapId: v.id("mindmaps") },
  handler: async (ctx, args): Promise<MindmapEvalStatus> => {
    assertRagEvalGate(args.evalSecret);
    const populated = await ctx.runQuery(internal.studio.mindmaps.index.getInternal, {
      id: args.mindmapId,
    });
    if (!populated) throw new Error(`Mindmap ${args.mindmapId} not found`);
    return {
      status: populated.status,
      title: populated.title,
      data: populated.data,
    };
  },
});

// ─── Infographics ────────────────────────────────────────────

export interface InfographicEvalKickoff {
  infographicId: string;
  startedAt: number;
}

export interface InfographicEvalStatus {
  status: string;
  title: string;
  data: unknown;
}

export const startInfographicEval = action({
  args: {
    evalSecret: v.string(),
    notebookId: v.id("notebooks"),
    documentIds: v.optional(v.array(v.id("documents"))),
    customPrompt: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<InfographicEvalKickoff> => {
    assertRagEvalGate(args.evalSecret);
    const { userId } = await resolveNotebookOwner(ctx, args.notebookId);
    const documentIds = await resolveDocumentIds(ctx, args.notebookId, userId, args.documentIds);

    const infographicId = await ctx.runMutation(
      internal.eval._studioRowCreators.createInfographicInternal,
      {
        userId,
        notebookId: args.notebookId,
        title: "Infographic (eval)",
      }
    );

    await ctx.scheduler.runAfter(0, internal.studio.infographic.generate.generateInfographicImage, {
      infographicId,
      userId,
      notebookId: args.notebookId,
      documentIds,
      customPrompt: args.customPrompt,
    });

    return { infographicId: infographicId as string, startedAt: Date.now() };
  },
});

export const getInfographicEvalStatus = action({
  args: { evalSecret: v.string(), infographicId: v.id("infographics") },
  handler: async (ctx, args): Promise<InfographicEvalStatus> => {
    assertRagEvalGate(args.evalSecret);
    const populated = await ctx.runQuery(internal.studio.infographic.index.getInternal, {
      id: args.infographicId,
    });
    if (!populated) throw new Error(`Infographic ${args.infographicId} not found`);
    return {
      status: populated.status,
      title: populated.title,
      data: populated.data,
    };
  },
});

// ─── Spreadsheets ────────────────────────────────────────────

export interface SpreadsheetEvalKickoff {
  spreadsheetId: string;
  startedAt: number;
}

export interface SpreadsheetEvalStatus {
  status: string;
  title: string;
  data: unknown;
}

export const startSpreadsheetEval = action({
  args: {
    evalSecret: v.string(),
    notebookId: v.id("notebooks"),
    documentIds: v.optional(v.array(v.id("documents"))),
    spreadsheetType: v.optional(v.string()),
    customPrompt: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<SpreadsheetEvalKickoff> => {
    assertRagEvalGate(args.evalSecret);
    const { userId } = await resolveNotebookOwner(ctx, args.notebookId);
    const documentIds = await resolveDocumentIds(ctx, args.notebookId, userId, args.documentIds);
    const spreadsheetType = args.spreadsheetType ?? "custom";
    const customPrompt = args.customPrompt ?? "";

    const spreadsheet = await ctx.runMutation(internal.studio.spreadsheets.index.createInternal, {
      userId,
      notebookId: args.notebookId,
      title: "Spreadsheet (eval)",
      spreadsheetType,
      customPrompt,
      metadata: { status: "generating", documentIds },
    });
    if (!spreadsheet) throw new Error("Failed to create spreadsheet row for eval");
    const spreadsheetId = spreadsheet._id as Id<"spreadsheets">;

    await ctx.scheduler.runAfter(0, internal.studio.spreadsheets.job.spreadsheetGeneration, {
      spreadsheetId,
      userId: userId as string,
      notebookId: args.notebookId,
      documentIds,
      spreadsheetType,
      customPrompt: args.customPrompt,
    });

    return { spreadsheetId: spreadsheetId as string, startedAt: Date.now() };
  },
});

export const getSpreadsheetEvalStatus = action({
  args: { evalSecret: v.string(), spreadsheetId: v.id("spreadsheets") },
  handler: async (ctx, args): Promise<SpreadsheetEvalStatus> => {
    assertRagEvalGate(args.evalSecret);
    const populated = await ctx.runQuery(internal.studio.spreadsheets.index.getInternal, {
      id: args.spreadsheetId,
    });
    if (!populated) throw new Error(`Spreadsheet ${args.spreadsheetId} not found`);
    return {
      status: populated.status,
      title: populated.title,
      data: populated.data,
    };
  },
});

// ─── Written Questions ───────────────────────────────────────

export interface WrittenQuestionsEvalKickoff {
  writtenQuestionId: string;
  startedAt: number;
}

export interface WrittenQuestionsEvalStatus {
  status: string;
  title: string;
  questions: Array<Record<string, unknown>>;
}

export const startWrittenQuestionsEval = action({
  args: {
    evalSecret: v.string(),
    notebookId: v.id("notebooks"),
    documentIds: v.optional(v.array(v.id("documents"))),
    questionCount: v.optional(v.number()),
    difficulty: v.optional(v.string()),
    questionType: v.optional(v.string()),
    focus: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<WrittenQuestionsEvalKickoff> => {
    assertRagEvalGate(args.evalSecret);
    const { userId } = await resolveNotebookOwner(ctx, args.notebookId);
    const documentIds = await resolveDocumentIds(ctx, args.notebookId, userId, args.documentIds);
    const questionCount = args.questionCount ?? 10;
    const difficulty = args.difficulty ?? "medium";
    const questionType = args.questionType ?? "short";

    const wq = await ctx.runMutation(internal.studio.writtenQuestions.index.createInternal, {
      userId,
      notebookId: args.notebookId,
      title: "Written Questions (eval)",
      questionType,
      metadata: { difficulty, questionCount, focus: args.focus, documentIds },
    });
    if (!wq) throw new Error("Failed to create writtenQuestion row for eval");
    const writtenQuestionId = wq._id as Id<"writtenQuestions">;

    await ctx.scheduler.runAfter(
      0,
      internal.studio.writtenQuestions.job.writtenQuestionsGeneration,
      {
        writtenQuestionId,
        userId,
        notebookId: args.notebookId,
        documentIds,
        questionCount,
        difficulty,
        questionType,
        focus: args.focus,
      }
    );

    return { writtenQuestionId: writtenQuestionId as string, startedAt: Date.now() };
  },
});

export const getWrittenQuestionsEvalStatus = action({
  args: { evalSecret: v.string(), writtenQuestionId: v.id("writtenQuestions") },
  handler: async (ctx, args): Promise<WrittenQuestionsEvalStatus> => {
    assertRagEvalGate(args.evalSecret);
    const populated = await ctx.runQuery(internal.studio.writtenQuestions.index.getInternal, {
      id: args.writtenQuestionId,
    });
    if (!populated) throw new Error(`WrittenQuestion ${args.writtenQuestionId} not found`);
    return {
      status: populated.status,
      title: populated.title,
      questions: Array.isArray(populated.questionsData) ? populated.questionsData : [],
    };
  },
});

// ─── Audio Overview (script-only eval) ───────────────────────

export interface AudioScriptEvalResult {
  audioOverviewId: string;
  title: string;
  status: string;
  /** Generated dialogue script (text). The TTS audio file is not evaluated. */
  transcript: string;
  audioUrl?: string;
  latencyMs: number;
}

// Audio script generation + TTS routinely runs 2–5 minutes. The Convex HTTP
// client and Vercel Functions both impose timeouts on a single action call,
// so the eval invokes audio as a kickoff (returns a row id immediately, with
// the job scheduled) and then polls the status from the client side. Each
// individual HTTP call is short.
export const startAudioScriptEval = action({
  args: {
    evalSecret: v.string(),
    notebookId: v.id("notebooks"),
    documentIds: v.optional(v.array(v.id("documents"))),
    audioType: v.optional(v.string()),
    length: v.optional(v.string()),
    focus: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ audioOverviewId: string; startedAt: number }> => {
    assertRagEvalGate(args.evalSecret);
    const { userId } = await resolveNotebookOwner(ctx, args.notebookId);
    const documentIds = await resolveDocumentIds(ctx, args.notebookId, userId, args.documentIds);

    const audioOverviewId = await ctx.runMutation(
      internal.eval._studioRowCreators.createAudioOverviewInternal,
      {
        userId,
        notebookId: args.notebookId,
        title: "Audio Overview (eval)",
        audioType: args.audioType,
        length: args.length,
        focus: args.focus,
      }
    );

    await ctx.scheduler.runAfter(0, internal.studio.audio.job.audioOverviewGeneration, {
      audioOverviewId,
      userId: userId as string,
      notebookId: args.notebookId,
      documentIds,
    });

    return {
      audioOverviewId: audioOverviewId as string,
      startedAt: Date.now(),
    };
  },
});

export const getAudioScriptEvalStatus = action({
  args: {
    evalSecret: v.string(),
    audioOverviewId: v.id("audioOverviews"),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    status: string;
    title: string;
    transcript: string;
    audioUrl?: string;
  }> => {
    assertRagEvalGate(args.evalSecret);
    const populated = await ctx.runQuery(internal.studio.audio.index.getInternal, {
      id: args.audioOverviewId,
    });
    if (!populated) {
      throw new Error(`AudioOverview ${args.audioOverviewId} not found`);
    }
    return {
      status: populated.status,
      title: populated.title,
      transcript: populated.transcript ?? "",
      audioUrl: populated.audioUrl,
    };
  },
});

// ─── Audio Script (SCRIPT-ONLY, no TTS) ─────────────────────

/** Script-only eval: generates dialogue script without TTS for faster iteration */
export const startAudioScriptOnlyEval = action({
  args: {
    evalSecret: v.string(),
    notebookId: v.id("notebooks"),
    documentIds: v.optional(v.array(v.id("documents"))),
    audioType: v.optional(v.string()),
    length: v.optional(v.string()),
    focus: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ audioOverviewId: string; startedAt: number }> => {
    assertRagEvalGate(args.evalSecret);
    const { userId } = await resolveNotebookOwner(ctx, args.notebookId);
    const documentIds = await resolveDocumentIds(ctx, args.notebookId, userId, args.documentIds);

    const audioOverviewId = await ctx.runMutation(
      internal.eval._studioRowCreators.createAudioOverviewInternal,
      {
        userId,
        notebookId: args.notebookId,
        title: "Audio Overview (eval, script-only)",
        audioType: args.audioType,
        length: args.length,
        focus: args.focus,
        skipTts: true,
      }
    );

    // Run full pipeline but TTS will be skipped because skipTts is in metadata
    await ctx.scheduler.runAfter(0, internal.studio.audio.job.audioOverviewGeneration, {
      audioOverviewId,
      userId: userId as string,
      notebookId: args.notebookId,
      documentIds,
    });

    return {
      audioOverviewId: audioOverviewId as string,
      startedAt: Date.now(),
    };
  },
});

export const getAudioScriptOnlyEvalStatus = action({
  args: {
    evalSecret: v.string(),
    audioOverviewId: v.id("audioOverviews"),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    status: string;
    title: string;
    transcript: string;
    audioUrl?: string;
  }> => {
    assertRagEvalGate(args.evalSecret);
    const populated = await ctx.runQuery(internal.studio.audio.index.getInternal, {
      id: args.audioOverviewId,
    });
    if (!populated) {
      throw new Error(`AudioOverview ${args.audioOverviewId} not found`);
    }
    return {
      status: populated.status,
      title: populated.title,
      transcript: populated.transcript ?? "",
      audioUrl: populated.audioUrl,
    };
  },
});

// Kept for backward compatibility, but the eval client should prefer the
// kickoff + poll flow above. This single-call variant can hit HTTP timeouts on
// long audio jobs.
export const runAudioScriptEval = action({
  args: {
    evalSecret: v.string(),
    notebookId: v.id("notebooks"),
    documentIds: v.optional(v.array(v.id("documents"))),
    audioType: v.optional(v.string()),
    length: v.optional(v.string()),
    focus: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<AudioScriptEvalResult> => {
    assertRagEvalGate(args.evalSecret);
    const startTime = Date.now();
    const { userId } = await resolveNotebookOwner(ctx, args.notebookId);
    const documentIds = await resolveDocumentIds(ctx, args.notebookId, userId, args.documentIds);

    const audioOverviewId = await ctx.runMutation(
      internal.eval._studioRowCreators.createAudioOverviewInternal,
      {
        userId,
        notebookId: args.notebookId,
        title: "Audio Overview (eval)",
        audioType: args.audioType,
        length: args.length,
        focus: args.focus,
      }
    );

    // The audio job runs script generation followed by TTS. For eval we accept
    // both — the resulting `transcript` is what we score; `audioUrl` is ignored.
    await ctx.runAction(internal.studio.audio.job.audioOverviewGeneration, {
      audioOverviewId,
      userId: userId as string,
      notebookId: args.notebookId,
      documentIds,
    });

    const populated = await pollUntilTerminal(
      ctx,
      () =>
        ctx.runQuery(internal.studio.audio.index.getInternal, {
          id: audioOverviewId,
        }),
      `AudioOverview ${audioOverviewId}`
    );

    return {
      audioOverviewId: audioOverviewId as string,
      title: populated.title,
      status: populated.status,
      transcript: populated.transcript ?? "",
      audioUrl: populated.audioUrl,
      latencyMs: Date.now() - startTime,
    };
  },
});
