import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../../_generated/server";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";

/**
 * Stuck-job watchdog for Studio generation.
 *
 * When Convex force-kills a phase action (600s action limit, OOM, runtime crash),
 * the action's try/catch never runs, so its mark*Failed mutation never fires and
 * the row stays `generating` forever. A cron runs this sweep every few minutes and
 * fails any `generating` row whose `updatedAt` has not advanced for longer than a
 * single action can live. Jobs that are still progressing keep bumping `updatedAt`
 * (every phase init, map result, and status update writes it), so they are skipped.
 */

/**
 * A row idle this long cannot still have a live action: every phase is an
 * internalAction capped at 600s, and each one writes `updatedAt` when it
 * starts or finishes. The extra 5 minutes absorbs scheduler queueing.
 *
 * Any new phase must keep this true: a delayed `runAfter`, or a phase that can
 * go longer than this without writing, needs to write `updatedAt` (a heartbeat)
 * or this threshold must be raised. Otherwise live jobs get failed.
 */
export const STUDIO_JOB_STALE_MS = 15 * 60 * 1000;

/** Stale rows failed per table per transaction; overflow continues in a new one. */
export const STUCK_JOB_SWEEP_BATCH_SIZE = 10;

export const STUCK_JOB_ERROR_MESSAGE =
  "Generation timed out and was stopped. Try again, or select fewer sources.";

type StudioJobTable =
  | "reports"
  | "audioOverviews"
  | "flashcards"
  | "mindmaps"
  | "quizzes"
  | "infographics"
  | "spreadsheets"
  | "writtenQuestions";

type FailStuckJob<T extends StudioJobTable> = (
  ctx: MutationCtx,
  id: Id<T>,
  metadata: Record<string, unknown>
) => Promise<unknown>;

/**
 * Each table fails through its existing mark*Failed mutation so the row gets the
 * same error metadata (and the same `· Failed` UI state) as an in-action failure.
 */
const FAIL_STUCK_JOB: { [T in StudioJobTable]: FailStuckJob<T> } = {
  reports: (ctx, reportId, metadata) =>
    ctx.runMutation(internal.studio.jobMutations.reports.markReportFailed, {
      reportId,
      error: STUCK_JOB_ERROR_MESSAGE,
      metadata,
    }),
  audioOverviews: (ctx, audioOverviewId, metadata) =>
    ctx.runMutation(internal.studio.jobMutations.audio.markAudioOverviewFailed, {
      audioOverviewId,
      error: STUCK_JOB_ERROR_MESSAGE,
      metadata,
    }),
  flashcards: (ctx, flashcardId, metadata) =>
    ctx.runMutation(internal.studio.jobMutations.flashcards.markFlashcardFailed, {
      flashcardId,
      error: STUCK_JOB_ERROR_MESSAGE,
      metadata,
    }),
  mindmaps: (ctx, mindmapId, metadata) =>
    ctx.runMutation(internal.studio.jobMutations.mindmaps.markMindMapFailed, {
      mindmapId,
      error: STUCK_JOB_ERROR_MESSAGE,
      metadata,
    }),
  quizzes: (ctx, quizId, metadata) =>
    ctx.runMutation(internal.studio.jobMutations.quizzes.markQuizFailed, {
      quizId,
      error: STUCK_JOB_ERROR_MESSAGE,
      metadata,
    }),
  infographics: (ctx, infographicId, metadata) =>
    ctx.runMutation(internal.studio.jobMutations.infographics.markInfographicFailed, {
      infographicId,
      error: STUCK_JOB_ERROR_MESSAGE,
      metadata,
    }),
  spreadsheets: (ctx, spreadsheetId, metadata) =>
    ctx.runMutation(internal.studio.jobMutations.spreadsheets.markSpreadsheetFailed, {
      spreadsheetId,
      error: STUCK_JOB_ERROR_MESSAGE,
      metadata,
    }),
  writtenQuestions: (ctx, writtenQuestionId, metadata) =>
    ctx.runMutation(internal.studio.jobMutations.writtenQuestions.markWrittenQuestionsFailed, {
      writtenQuestionId,
      error: STUCK_JOB_ERROR_MESSAGE,
      metadata,
    }),
};

const STUDIO_JOB_TABLES = Object.keys(FAIL_STUCK_JOB) as StudioJobTable[];

export interface StuckJobBatchResult {
  /** Rows marked failed. */
  failed: number;
  /** Rows whose failure write threw; they stay `generating` for a later sweep. */
  errored: number;
}

/**
 * Fails up to `limit` stale rows in one table. Each failure write runs as its
 * own subtransaction, so a row that throws (e.g. fails schema validation) is
 * rolled back and logged without aborting the rest of the sweep.
 */
export async function failStuckJobs(
  ctx: MutationCtx,
  table: StudioJobTable,
  cutoff: number,
  limit: number,
  // Safe widening: every row id below comes from `table`, the same key we look up.
  fail = FAIL_STUCK_JOB[table] as FailStuckJob<StudioJobTable>
): Promise<StuckJobBatchResult> {
  const stuck = await ctx.db
    .query(table)
    .withIndex("by_status_and_updatedAt", (q) =>
      q.eq("status", "generating").lt("updatedAt", cutoff)
    )
    .take(limit);

  const logger = createServiceLogger("studio", "stuckJobSweep");
  const result: StuckJobBatchResult = { failed: 0, errored: 0 };
  for (const row of stuck) {
    const phase = (row.metadata?.phase as string | undefined) ?? "unknown";
    // errorType + errorPhase make buildErrorMetadata record them as given
    // instead of classifying the (generic) message.
    const metadata: Record<string, unknown> = {
      ...(row.metadata ?? {}),
      errorType: "job_stalled",
      errorPhase: phase,
      retryable: true,
    };
    const context = { table, jobId: row._id, phase, idleMs: Date.now() - row.updatedAt };
    try {
      await fail(ctx, row._id, metadata);
      logger.warn("Failed stuck Studio job", context);
      result.failed++;
    } catch (error) {
      logger.error("Could not fail stuck Studio job", {
        ...context,
        error: error instanceof Error ? error.message : String(error),
      });
      result.errored++;
    }
  }
  return result;
}

/**
 * Whether to run another sweep straight away. Only when some table filled its
 * batch AND the sweep made progress: rows that keep throwing are re-read on
 * every pass, so rescheduling on those alone would loop with no delay forever.
 * They are retried by the next cron run instead.
 */
export function sweepHasMore(results: StuckJobBatchResult[], limit: number): boolean {
  const madeProgress = results.some((r) => r.failed > 0);
  return madeProgress && results.some((r) => r.failed + r.errored === limit);
}

export const sweepStuckStudioJobs = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ failed: number; errored: number }> => {
    const cutoff = Date.now() - STUDIO_JOB_STALE_MS;
    const results: StuckJobBatchResult[] = [];
    for (const table of STUDIO_JOB_TABLES) {
      results.push(await failStuckJobs(ctx, table, cutoff, STUCK_JOB_SWEEP_BATCH_SIZE));
    }

    if (sweepHasMore(results, STUCK_JOB_SWEEP_BATCH_SIZE)) {
      await ctx.scheduler.runAfter(
        0,
        internal.studio.jobMutations.stuckJobs.sweepStuckStudioJobs,
        {}
      );
    }
    return {
      failed: results.reduce((n, r) => n + r.failed, 0),
      errored: results.reduce((n, r) => n + r.errored, 0),
    };
  },
});
