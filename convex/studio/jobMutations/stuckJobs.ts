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

/** Fails up to `limit` stale rows in one table; returns how many it failed. */
async function failStuckJobs(
  ctx: MutationCtx,
  table: StudioJobTable,
  cutoff: number,
  limit: number
): Promise<number> {
  const stuck = await ctx.db
    .query(table)
    .withIndex("by_status_and_updatedAt", (q) =>
      q.eq("status", "generating").lt("updatedAt", cutoff)
    )
    .take(limit);

  const logger = createServiceLogger("studio", "stuckJobSweep");
  // Safe widening: every row id below comes from `table`, the same key we look up.
  const fail = FAIL_STUCK_JOB[table] as FailStuckJob<StudioJobTable>;
  for (const row of stuck) {
    const metadata: Record<string, unknown> = { ...(row.metadata ?? {}), isTimeout: true };
    logger.warn("Failing stuck Studio job", {
      table,
      jobId: row._id,
      phase: metadata.phase ?? "unknown",
      idleMs: Date.now() - row.updatedAt,
    });
    await fail(ctx, row._id, metadata);
  }
  return stuck.length;
}

export const sweepStuckStudioJobs = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ failed: number }> => {
    const cutoff = Date.now() - STUDIO_JOB_STALE_MS;
    let failed = 0;
    let hasMore = false;

    for (const table of STUDIO_JOB_TABLES) {
      const count = await failStuckJobs(ctx, table, cutoff, STUCK_JOB_SWEEP_BATCH_SIZE);
      failed += count;
      if (count === STUCK_JOB_SWEEP_BATCH_SIZE) hasMore = true;
    }

    if (hasMore) {
      await ctx.scheduler.runAfter(
        0,
        internal.studio.jobMutations.stuckJobs.sweepStuckStudioJobs,
        {}
      );
    }
    return { failed };
  },
});
