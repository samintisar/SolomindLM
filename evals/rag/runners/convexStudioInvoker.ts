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
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { AgentStageSpan, EvalFixture, StudioRunnerKind } from "../types";

interface ConvexStudioInvokerOptions {
  evalSecret: string;
}

interface StudioInvokeContext {
  notebookId: string;
  documentIds?: string[];
  studioParams?: EvalFixture["studioParams"];
}

interface StudioInvokeResult {
  /** Structured payload — shape varies per kind */
  raw: unknown;
  /**
   * Client wall-clock ms from kickoff until the poll that saw a terminal status. Includes
   * network round trips and up to one poll interval ({@link POLL_INTERVAL_MS}) of slack.
   */
  latencyMs: number;
  /** Optional token usage if the action returned it */
  tokenUsage?: { prompt: number; completion: number; total: number };
  tokenUsageSource?: "provider" | "estimated";
  stageSpans?: AgentStageSpan[];
}

interface StudioJobTelemetry {
  tokenUsage?: { prompt: number; completion: number; total: number };
  tokenUsageSource?: "provider" | "estimated";
  stageSpans?: AgentStageSpan[];
}

export function pickStudioInvokeTelemetry(
  status: StudioJobTelemetry
): Pick<StudioInvokeResult, "tokenUsage" | "tokenUsageSource" | "stageSpans"> {
  return {
    ...(status.tokenUsage !== undefined ? { tokenUsage: status.tokenUsage } : {}),
    ...(status.tokenUsageSource !== undefined ? { tokenUsageSource: status.tokenUsageSource } : {}),
    ...(status.stageSpans !== undefined ? { stageSpans: status.stageSpans } : {}),
  };
}

export interface StudioInvoker {
  kind: StudioRunnerKind;
  invoke(context: StudioInvokeContext): Promise<StudioInvokeResult>;
}

// ─── Polling helpers ─────────────────────────────────────────

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 20 * 60 * 1000;
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

// ─── Invoker definitions ─────────────────────────────────────

type StudioAction = FunctionReference<"action">;
type StudioParams = NonNullable<EvalFixture["studioParams"]>;
/** Args every kickoff action takes; the invoker fills these in itself. */
type CommonStartArgs = "evalSecret" | "notebookId" | "documentIds";

/**
 * One studio kind: a kickoff action returning `{ [idKey]: id }` and a status action taking
 * `{ evalSecret, [idKey]: id }`. `buildArgs` maps fixture studio params onto the kickoff's
 * kind-specific args.
 */
interface StudioInvokerSpec<
  Start extends StudioAction,
  Status extends StudioAction,
  IdKey extends keyof FunctionReturnType<Start> & keyof FunctionArgs<Status> & string,
> {
  kind: StudioRunnerKind;
  /** Label used in poll-timeout errors, e.g. "Report" */
  label: string;
  start: Start;
  status: Status;
  idKey: IdKey;
  buildArgs: (params: StudioParams) => Omit<FunctionArgs<Start>, CommonStartArgs>;
}

type StudioInvokerFactory = (
  client: ConvexHttpClient,
  options: ConvexStudioInvokerOptions
) => StudioInvoker;

function defineStudioInvoker<
  Start extends StudioAction,
  Status extends StudioAction,
  IdKey extends keyof FunctionReturnType<Start> & keyof FunctionArgs<Status> & string,
>(spec: StudioInvokerSpec<Start, Status, IdKey>): StudioInvokerFactory {
  return (client, options) => ({
    kind: spec.kind,
    async invoke(context) {
      const startTime = Date.now();
      const started = await client.action(spec.start, {
        evalSecret: options.evalSecret,
        notebookId: context.notebookId as Id<"notebooks">,
        documentIds: context.documentIds as Id<"documents">[] | undefined,
        ...spec.buildArgs(context.studioParams ?? {}),
      } as FunctionArgs<Start>);
      const id = (started as Record<IdKey, string>)[spec.idKey];
      const populated = await pollStatus(
        async () =>
          (await client.action(spec.status, {
            evalSecret: options.evalSecret,
            [spec.idKey]: id,
          } as FunctionArgs<Status>)) as StudioJobTelemetry & { status: string },
        `${spec.label} ${id}`
      );
      return {
        raw: { [spec.idKey]: id, ...populated },
        latencyMs: Date.now() - startTime,
        ...pickStudioInvokeTelemetry(populated),
      };
    },
  });
}

const studio = api.eval.studioEvalAction;

/** Studio runner kind → invoker factory. Add new kinds here as their Convex eval actions land. */
export const STUDIO_INVOKER_FACTORIES: Partial<Record<StudioRunnerKind, StudioInvokerFactory>> = {
  report: defineStudioInvoker({
    kind: "report",
    label: "Report",
    start: studio.startReportEval,
    status: studio.getReportEvalStatus,
    idKey: "reportId",
    buildArgs: (p) => ({
      reportType: p.reportType,
      customPrompt: p.customPrompt,
      smartLlm: p.smartLlm,
      documentTitleHint: p.documentTitleHint,
    }),
  }),
  flashcards: defineStudioInvoker({
    kind: "flashcards",
    label: "Flashcards",
    start: studio.startFlashcardsEval,
    status: studio.getFlashcardsEvalStatus,
    idKey: "flashcardId",
    buildArgs: (p) => ({
      cardCount: p.cardCount,
      difficulty: p.difficulty,
      topic: p.topic,
      smartLlm: p.smartLlm,
    }),
  }),
  quiz: defineStudioInvoker({
    kind: "quiz",
    label: "Quiz",
    start: studio.startQuizEval,
    status: studio.getQuizEvalStatus,
    idKey: "quizId",
    buildArgs: (p) => ({
      questionCount: p.questionCount,
      difficulty: p.difficulty,
      focus: p.topic,
    }),
  }),
  mindmap: defineStudioInvoker({
    kind: "mindmap",
    label: "Mindmap",
    start: studio.startMindmapEval,
    status: studio.getMindmapEvalStatus,
    idKey: "mindmapId",
    buildArgs: (p) => ({ customPrompt: p.customPrompt }),
  }),
  infographic: defineStudioInvoker({
    kind: "infographic",
    label: "Infographic",
    start: studio.startInfographicEval,
    status: studio.getInfographicEvalStatus,
    idKey: "infographicId",
    buildArgs: (p) => ({ customPrompt: p.customPrompt }),
  }),
  spreadsheet: defineStudioInvoker({
    kind: "spreadsheet",
    label: "Spreadsheet",
    start: studio.startSpreadsheetEval,
    status: studio.getSpreadsheetEvalStatus,
    idKey: "spreadsheetId",
    buildArgs: (p) => ({ customPrompt: p.customPrompt }),
  }),
  writtenQuestions: defineStudioInvoker({
    kind: "writtenQuestions",
    label: "WrittenQuestions",
    start: studio.startWrittenQuestionsEval,
    status: studio.getWrittenQuestionsEvalStatus,
    idKey: "writtenQuestionId",
    buildArgs: (p) => ({
      documentTitleHint: p.documentTitleHint,
      questionCount: p.questionCount,
      difficulty: p.difficulty,
      focus: p.topic,
    }),
  }),
  audioScript: defineStudioInvoker({
    kind: "audioScript",
    label: "AudioScript",
    start: studio.startAudioScriptEval,
    status: studio.getAudioScriptEvalStatus,
    idKey: "audioOverviewId",
    buildArgs: (p) => ({ focus: p.topic, length: p.length, audioType: p.audioType }),
  }),
  audioScriptOnly: defineStudioInvoker({
    kind: "audioScriptOnly",
    label: "AudioScriptOnly",
    start: studio.startAudioScriptOnlyEval,
    status: studio.getAudioScriptOnlyEvalStatus,
    idKey: "audioOverviewId",
    buildArgs: (p) => ({ focus: p.topic, length: p.length, audioType: p.audioType }),
  }),
};

/**
 * Build every registered studio invoker for the given Convex URL/secret, sharing one HTTP
 * client (fixtures run one at a time). Kinds without a registered factory are omitted; the
 * runner surfaces a clear error if a fixture references one of them.
 */
export function createConvexStudioInvokers(
  convexUrl: string,
  options: ConvexStudioInvokerOptions
): Partial<Record<StudioRunnerKind, StudioInvoker>> {
  const client = new ConvexHttpClient(convexUrl);
  const map: Partial<Record<StudioRunnerKind, StudioInvoker>> = {};
  for (const [kind, factory] of Object.entries(STUDIO_INVOKER_FACTORIES) as Array<
    [StudioRunnerKind, StudioInvokerFactory]
  >) {
    map[kind] = factory(client, options);
  }
  return map;
}
