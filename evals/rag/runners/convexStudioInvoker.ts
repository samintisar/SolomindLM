/**
 * Studio agent invokers backed by Convex eval actions.
 *
 * Each studio kind exposes a kickoff action (`start*Eval`) plus a status
 * action (`get*EvalStatus`) in [convex/eval/studioEvalAction.ts](../../../convex/eval/studioEvalAction.ts).
 * The invokers here are thin clients that schedule the job, then poll the
 * status from the client side. Each HTTP call is short, so studio jobs that
 * legitimately take 4–10 minutes do not collide with the HTTP transport
 * timeout that bites a single long-running `client.action(...)` call.
 *
 * Result-to-artifact conversion lives in [studioRunner.ts](./studioRunner.ts).
 */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { EvalFixture, StudioRunnerKind } from "../types";

export interface ConvexStudioInvokerOptions {
  evalSecret: string;
}

export interface StudioInvokeContext {
  notebookId: string;
  documentIds?: string[];
  studioParams?: EvalFixture["studioParams"];
}

export interface StudioInvokeResult {
  /** Structured payload — shape varies per kind */
  raw: unknown;
  /** Server-measured latency in ms (excludes client/network) */
  latencyMs: number;
  /** Optional token usage if the action returned it */
  tokenUsage?: { prompt: number; completion: number; total: number };
}

export interface StudioInvoker {
  kind: StudioRunnerKind;
  invoke(context: StudioInvokeContext): Promise<StudioInvokeResult>;
}

// ─── Polling helpers ─────────────────────────────────────────

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;
const TERMINAL_STATUSES = new Set(["completed", "failed"]);

async function pollStatus<T extends { status: string }>(
  read: () => Promise<T>,
  label: string
): Promise<T> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let last: T | null = null;
  while (Date.now() < deadline) {
    last = await read();
    if (TERMINAL_STATUSES.has(last.status)) return last;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(
    `${label}: did not reach terminal status in ${POLL_TIMEOUT_MS}ms (last: ${last?.status ?? "unknown"})`
  );
}

// ─── Reports ─────────────────────────────────────────────────

export function createConvexReportInvoker(
  convexUrl: string,
  options: ConvexStudioInvokerOptions
): StudioInvoker {
  const client = new ConvexHttpClient(convexUrl);
  return {
    kind: "report",
    async invoke(context) {
      const startTime = Date.now();
      const { reportId } = await client.action(api.eval.studioEvalAction.startReportEval, {
        evalSecret: options.evalSecret,
        notebookId: context.notebookId as Id<"notebooks">,
        documentIds: context.documentIds as Id<"documents">[] | undefined,
        reportType: context.studioParams?.reportType,
        customPrompt: context.studioParams?.customPrompt,
        smartLlm: context.studioParams?.smartLlm,
      });
      const populated = await pollStatus(
        () =>
          client.action(api.eval.studioEvalAction.getReportEvalStatus, {
            evalSecret: options.evalSecret,
            reportId: reportId as Id<"reports">,
          }),
        `Report ${reportId}`
      );
      return {
        raw: { reportId, ...populated },
        latencyMs: Date.now() - startTime,
      };
    },
  };
}

// ─── Flashcards ──────────────────────────────────────────────

export function createConvexFlashcardsInvoker(
  convexUrl: string,
  options: ConvexStudioInvokerOptions
): StudioInvoker {
  const client = new ConvexHttpClient(convexUrl);
  return {
    kind: "flashcards",
    async invoke(context) {
      const startTime = Date.now();
      const { flashcardId } = await client.action(
        api.eval.studioEvalAction.startFlashcardsEval,
        {
          evalSecret: options.evalSecret,
          notebookId: context.notebookId as Id<"notebooks">,
          documentIds: context.documentIds as Id<"documents">[] | undefined,
          cardCount: context.studioParams?.cardCount,
          difficulty: context.studioParams?.difficulty,
          topic: context.studioParams?.topic,
          smartLlm: context.studioParams?.smartLlm,
        }
      );
      const populated = await pollStatus(
        () =>
          client.action(api.eval.studioEvalAction.getFlashcardsEvalStatus, {
            evalSecret: options.evalSecret,
            flashcardId: flashcardId as Id<"flashcards">,
          }),
        `Flashcards ${flashcardId}`
      );
      return {
        raw: { flashcardId, ...populated },
        latencyMs: Date.now() - startTime,
      };
    },
  };
}

// ─── Quiz ────────────────────────────────────────────────────

export function createConvexQuizInvoker(
  convexUrl: string,
  options: ConvexStudioInvokerOptions
): StudioInvoker {
  const client = new ConvexHttpClient(convexUrl);
  return {
    kind: "quiz",
    async invoke(context) {
      const startTime = Date.now();
      const { quizId } = await client.action(api.eval.studioEvalAction.startQuizEval, {
        evalSecret: options.evalSecret,
        notebookId: context.notebookId as Id<"notebooks">,
        documentIds: context.documentIds as Id<"documents">[] | undefined,
        questionCount: context.studioParams?.questionCount,
        difficulty: context.studioParams?.difficulty,
        focus: context.studioParams?.topic,
      });
      const populated = await pollStatus(
        () =>
          client.action(api.eval.studioEvalAction.getQuizEvalStatus, {
            evalSecret: options.evalSecret,
            quizId: quizId as Id<"quizzes">,
          }),
        `Quiz ${quizId}`
      );
      return {
        raw: { quizId, ...populated },
        latencyMs: Date.now() - startTime,
      };
    },
  };
}

// ─── Mindmap ─────────────────────────────────────────────────

export function createConvexMindmapInvoker(
  convexUrl: string,
  options: ConvexStudioInvokerOptions
): StudioInvoker {
  const client = new ConvexHttpClient(convexUrl);
  return {
    kind: "mindmap",
    async invoke(context) {
      const startTime = Date.now();
      const { mindmapId } = await client.action(api.eval.studioEvalAction.startMindmapEval, {
        evalSecret: options.evalSecret,
        notebookId: context.notebookId as Id<"notebooks">,
        documentIds: context.documentIds as Id<"documents">[] | undefined,
      });
      const populated = await pollStatus(
        () =>
          client.action(api.eval.studioEvalAction.getMindmapEvalStatus, {
            evalSecret: options.evalSecret,
            mindmapId: mindmapId as Id<"mindmaps">,
          }),
        `Mindmap ${mindmapId}`
      );
      return {
        raw: { mindmapId, ...populated },
        latencyMs: Date.now() - startTime,
      };
    },
  };
}

// ─── Slides (deferred) ───────────────────────────────────────
// Slides currently exceeds the studio eval reliability budget and is
// excluded from the eval suite at the runner-set level. Keep the factory
// so single-fixture runs (`--case studio-slides-...`) still resolve, but
// route them through whatever single-call action remains.
export function createConvexSlidesInvoker(
  _convexUrl: string,
  _options: ConvexStudioInvokerOptions
): StudioInvoker {
  return {
    kind: "slides",
    async invoke() {
      throw new Error(
        "Slides eval is currently disabled — no kickoff+poll action exists for this kind."
      );
    },
  };
}

// ─── Spreadsheet ─────────────────────────────────────────────

export function createConvexSpreadsheetInvoker(
  convexUrl: string,
  options: ConvexStudioInvokerOptions
): StudioInvoker {
  const client = new ConvexHttpClient(convexUrl);
  return {
    kind: "spreadsheet",
    async invoke(context) {
      const startTime = Date.now();
      const { spreadsheetId } = await client.action(
        api.eval.studioEvalAction.startSpreadsheetEval,
        {
          evalSecret: options.evalSecret,
          notebookId: context.notebookId as Id<"notebooks">,
          documentIds: context.documentIds as Id<"documents">[] | undefined,
          customPrompt: context.studioParams?.customPrompt,
        }
      );
      const populated = await pollStatus(
        () =>
          client.action(api.eval.studioEvalAction.getSpreadsheetEvalStatus, {
            evalSecret: options.evalSecret,
            spreadsheetId: spreadsheetId as Id<"spreadsheets">,
          }),
        `Spreadsheet ${spreadsheetId}`
      );
      return {
        raw: { spreadsheetId, ...populated },
        latencyMs: Date.now() - startTime,
      };
    },
  };
}

// ─── Written Questions ───────────────────────────────────────

export function createConvexWrittenQuestionsInvoker(
  convexUrl: string,
  options: ConvexStudioInvokerOptions
): StudioInvoker {
  const client = new ConvexHttpClient(convexUrl);
  return {
    kind: "writtenQuestions",
    async invoke(context) {
      const startTime = Date.now();
      const { writtenQuestionId } = await client.action(
        api.eval.studioEvalAction.startWrittenQuestionsEval,
        {
          evalSecret: options.evalSecret,
          notebookId: context.notebookId as Id<"notebooks">,
          documentIds: context.documentIds as Id<"documents">[] | undefined,
          questionCount: context.studioParams?.questionCount,
          difficulty: context.studioParams?.difficulty,
          focus: context.studioParams?.topic,
        }
      );
      const populated = await pollStatus(
        () =>
          client.action(api.eval.studioEvalAction.getWrittenQuestionsEvalStatus, {
            evalSecret: options.evalSecret,
            writtenQuestionId: writtenQuestionId as Id<"writtenQuestions">,
          }),
        `WrittenQuestions ${writtenQuestionId}`
      );
      return {
        raw: { writtenQuestionId, ...populated },
        latencyMs: Date.now() - startTime,
      };
    },
  };
}

// ─── Audio Script ────────────────────────────────────────────

export function createConvexAudioScriptInvoker(
  convexUrl: string,
  options: ConvexStudioInvokerOptions
): StudioInvoker {
  const client = new ConvexHttpClient(convexUrl);
  return {
    kind: "audioScript",
    async invoke(context) {
      const startTime = Date.now();
      const { audioOverviewId } = await client.action(
        api.eval.studioEvalAction.startAudioScriptEval,
        {
          evalSecret: options.evalSecret,
          notebookId: context.notebookId as Id<"notebooks">,
          documentIds: context.documentIds as Id<"documents">[] | undefined,
          focus: context.studioParams?.topic,
        }
      );
      const populated = await pollStatus(
        () =>
          client.action(api.eval.studioEvalAction.getAudioScriptEvalStatus, {
            evalSecret: options.evalSecret,
            audioOverviewId: audioOverviewId as Id<"audioOverviews">,
          }),
        `AudioScript ${audioOverviewId}`
      );
      return {
        raw: { audioOverviewId, ...populated },
        latencyMs: Date.now() - startTime,
      };
    },
  };
}

// ─── Invoker registry ────────────────────────────────────────

/**
 * Map of studio runner kind → invoker factory. Add new kinds here as their
 * Convex eval actions land.
 */
export type StudioInvokerFactory = (
  convexUrl: string,
  options: ConvexStudioInvokerOptions
) => StudioInvoker;

export const STUDIO_INVOKER_FACTORIES: Partial<
  Record<StudioRunnerKind, StudioInvokerFactory>
> = {
  report: createConvexReportInvoker,
  flashcards: createConvexFlashcardsInvoker,
  quiz: createConvexQuizInvoker,
  mindmap: createConvexMindmapInvoker,
  slides: createConvexSlidesInvoker,
  spreadsheet: createConvexSpreadsheetInvoker,
  writtenQuestions: createConvexWrittenQuestionsInvoker,
  audioScript: createConvexAudioScriptInvoker,
};

/**
 * Build a map of all available studio invokers for the given Convex URL/secret.
 * Kinds without a registered factory are omitted; the runner will surface a
 * clear error if a fixture references one of them.
 */
export function createConvexStudioInvokers(
  convexUrl: string,
  options: ConvexStudioInvokerOptions
): Partial<Record<StudioRunnerKind, StudioInvoker>> {
  const map: Partial<Record<StudioRunnerKind, StudioInvoker>> = {};
  for (const [kind, factory] of Object.entries(STUDIO_INVOKER_FACTORIES) as Array<
    [StudioRunnerKind, StudioInvokerFactory]
  >) {
    map[kind] = factory(convexUrl, options);
  }
  return map;
}
