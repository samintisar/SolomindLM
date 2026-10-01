import { PersistentTextStreaming, type StreamId } from "@convex-dev/persistent-text-streaming";
import { components } from "../_generated/api";
import type { Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { deleteSynthesisChunkFiles } from "../studio/jobMutations/audio";

/**
 * Rows deleted per transaction. Chunk rows carry embeddings, so this stays well under
 * Convex's per-transaction read/write limits; larger accounts continue in a fresh
 * scheduled transaction.
 */
export const PURGE_BATCH_SIZE = 200;

/** Auth tables cleared synchronously by `deleteUserIdentity` (signs the user out everywhere). */
export const IDENTITY_TABLES: readonly TableNames[] = [
  "users",
  "authAccounts",
  "authSessions",
  "authRefreshTokens",
  "authVerificationCodes",
  "authRateLimits",
];

type Budget = { remaining: number };
type Row = { _id: Id<TableNames> };
type Take<R extends Row> = (n: number) => Promise<R[]>;
type Child = { take: Take<Row>; beforeDelete?: (row: Row) => Promise<void> };

type PurgeStep = {
  /** Every table this step deletes from (checked against the schema in tests). */
  tables: readonly TableNames[];
  /** Deletes within `budget`; resolves true once nothing is left for this user. */
  run: (ctx: MutationCtx, userId: Id<"users">, budget: Budget) => Promise<boolean>;
};

async function drain<R extends Row>(
  ctx: MutationCtx,
  budget: Budget,
  take: Take<R>,
  beforeDelete?: (row: R) => Promise<void>
): Promise<boolean> {
  while (budget.remaining > 0) {
    const requested = budget.remaining;
    const rows = await take(requested);
    for (const row of rows) {
      if (beforeDelete) await beforeDelete(row);
      await ctx.db.delete(row._id);
      budget.remaining -= 1;
    }
    if (rows.length < requested) return true;
  }
  return false;
}

/** Deletes parents one at a time, each after all of its children. */
async function drainWithChildren<P extends Row>(
  ctx: MutationCtx,
  budget: Budget,
  take: Take<P>,
  children: (parent: P) => Child[],
  beforeDelete?: (parent: P) => Promise<void>
): Promise<boolean> {
  while (budget.remaining > 0) {
    const [parent] = await take(1);
    if (!parent) return true;
    for (const child of children(parent)) {
      if (!(await drain(ctx, budget, child.take, child.beforeDelete))) return false;
    }
    if (beforeDelete) await beforeDelete(parent);
    await ctx.db.delete(parent._id);
    budget.remaining -= 1;
  }
  return false;
}

async function deleteStoredFile(ctx: MutationCtx, storageId: string): Promise<void> {
  try {
    await ctx.storage.delete(storageId as Id<"_storage">);
  } catch (error) {
    // Already gone (or never stored) — nothing left to remove.
    console.warn(`[accountDeletion] could not delete stored file ${storageId}`, error);
  }
}

/** Overviews saved before `audioStorageId` existed keep only their URL (`…/api/storage/<id>`). */
function storageIdFromUrl(url: string | undefined): string | null {
  const match = url ? /\/api\/storage\/([^/?#]+)/.exec(url) : null;
  return match ? decodeURIComponent(match[1]) : null;
}

const streaming = new PersistentTextStreaming(components.persistentTextStreaming);

/** A table whose rows point straight at the owner through a user index. */
function direct<R extends Row>(
  table: TableNames,
  take: (ctx: MutationCtx, userId: Id<"users">, n: number) => Promise<R[]>
): PurgeStep {
  return {
    tables: [table],
    run: (ctx, userId, budget) => drain(ctx, budget, (n) => take(ctx, userId, n)),
  };
}

/**
 * Everything a user owns, in deletion order. Notebook deletion doesn't cascade today,
 * so content is found by owner rather than through notebooks.
 */
export const PURGE_STEPS: readonly PurgeStep[] = [
  {
    tables: ["documents", "documentChunks"],
    run: (ctx, userId, budget) =>
      drainWithChildren(
        ctx,
        budget,
        (n) =>
          ctx.db
            .query("documents")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .take(n),
        (doc) => [
          {
            take: (n) =>
              ctx.db
                .query("documentChunks")
                .withIndex("by_document", (q) => q.eq("documentId", doc._id))
                .take(n),
          },
        ],
        async (doc) => {
          if (doc.storageId) await deleteStoredFile(ctx, doc.storageId);
        }
      ),
  },
  {
    tables: ["conversations", "messages"],
    run: (ctx, userId, budget) =>
      drainWithChildren(
        ctx,
        budget,
        (n) =>
          ctx.db
            .query("conversations")
            .withIndex("by_user_notebook", (q) => q.eq("userId", userId))
            .take(n),
        (conversation) => [
          {
            take: (n) =>
              ctx.db
                .query("messages")
                .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
                .take(n),
            beforeDelete: async (row) => {
              const streamId = (row as { streamId?: string }).streamId;
              if (!streamId) return;
              try {
                await streaming.deleteStream(ctx, streamId as StreamId);
              } catch (error) {
                console.warn(`[accountDeletion] could not delete stream ${streamId}`, error);
              }
            },
          },
        ]
      ),
  },
  {
    tables: ["researchRuns", "researchEvidence", "researchSteps"],
    run: (ctx, userId, budget) =>
      drainWithChildren(
        ctx,
        budget,
        (n) =>
          ctx.db
            .query("researchRuns")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .take(n),
        (run) => [
          {
            take: (n) =>
              ctx.db
                .query("researchEvidence")
                .withIndex("by_run", (q) => q.eq("runId", run._id))
                .take(n),
          },
          {
            take: (n) =>
              ctx.db
                .query("researchSteps")
                .withIndex("by_research", (q) => q.eq("researchId", run._id))
                .take(n),
          },
        ]
      ),
  },
  {
    tables: [
      "literatureReviewSessions",
      "literatureReviewScreeningDecisions",
      "literatureTableDrafts",
      "literatureReviewRankedPapers",
      "researchSteps",
    ],
    run: (ctx, userId, budget) =>
      drainWithChildren(
        ctx,
        budget,
        (n) =>
          ctx.db
            .query("literatureReviewSessions")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .take(n),
        (session) => [
          {
            take: (n) =>
              ctx.db
                .query("literatureReviewScreeningDecisions")
                .withIndex("by_session", (q) => q.eq("sessionId", session._id))
                .take(n),
          },
          {
            take: (n) =>
              ctx.db
                .query("literatureTableDrafts")
                .withIndex("by_session", (q) => q.eq("sessionId", session._id))
                .take(n),
          },
          {
            take: (n) =>
              ctx.db
                .query("literatureReviewRankedPapers")
                .withIndex("by_session", (q) => q.eq("sessionId", session._id))
                .take(n),
          },
          {
            take: (n) =>
              ctx.db
                .query("researchSteps")
                .withIndex("by_research", (q) => q.eq("researchId", session._id))
                .take(n),
          },
        ]
      ),
  },
  {
    // A public prompt takes everyone's saves, ratings and reports of it along with it.
    tables: ["studioPrompts", "studioPromptSaves", "studioPromptRatings", "studioPromptReports"],
    run: (ctx, userId, budget) =>
      drainWithChildren(
        ctx,
        budget,
        (n) =>
          ctx.db
            .query("studioPrompts")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .take(n),
        (prompt) => [
          {
            take: (n) =>
              ctx.db
                .query("studioPromptSaves")
                .withIndex("by_public_prompt", (q) => q.eq("publicPromptId", prompt._id))
                .take(n),
          },
          {
            take: (n) =>
              ctx.db
                .query("studioPromptRatings")
                .withIndex("by_public_prompt", (q) => q.eq("publicPromptId", prompt._id))
                .take(n),
          },
          {
            take: (n) =>
              ctx.db
                .query("studioPromptReports")
                .withIndex("by_prompt", (q) => q.eq("promptId", prompt._id))
                .take(n),
          },
        ]
      ),
  },
  {
    tables: ["notebooks", "notebookShareLinks", "notebookMembers"],
    run: (ctx, userId, budget) =>
      drainWithChildren(
        ctx,
        budget,
        (n) =>
          ctx.db
            .query("notebooks")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .take(n),
        (notebook) => [
          {
            take: (n) =>
              ctx.db
                .query("notebookShareLinks")
                .withIndex("by_notebook", (q) => q.eq("notebookId", notebook._id))
                .take(n),
          },
          {
            take: (n) =>
              ctx.db
                .query("notebookMembers")
                .withIndex("by_notebook", (q) => q.eq("notebookId", notebook._id))
                .take(n),
          },
        ]
      ),
  },
  {
    tables: ["audioOverviews"],
    run: (ctx, userId, budget) =>
      drain(
        ctx,
        budget,
        (n) =>
          ctx.db
            .query("audioOverviews")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .take(n),
        async (overview) => {
          // Chunk MP3s left behind by an unfinished synthesis.
          await deleteSynthesisChunkFiles(ctx, overview.metadata).catch((error: unknown) =>
            console.warn("[accountDeletion] could not delete audio chunk files", error)
          );
          const storageId = overview.audioStorageId ?? storageIdFromUrl(overview.audioUrl);
          if (storageId) await deleteStoredFile(ctx, storageId);
        }
      ),
  },
  // Memberships in other people's notebooks.
  direct("notebookMembers", (ctx, userId, n) =>
    ctx.db
      .query("notebookMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(n)
  ),
  // The user's saves, ratings and reports of other people's prompts.
  direct("studioPromptSaves", (ctx, userId, n) =>
    ctx.db
      .query("studioPromptSaves")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(n)
  ),
  direct("studioPromptRatings", (ctx, userId, n) =>
    ctx.db
      .query("studioPromptRatings")
      .withIndex("by_user_and_public_prompt", (q) => q.eq("userId", userId))
      .take(n)
  ),
  direct("studioPromptReports", (ctx, userId, n) =>
    ctx.db
      .query("studioPromptReports")
      .withIndex("by_reporter", (q) => q.eq("reporterUserId", userId))
      .take(n)
  ),
  direct("userOnboarding", (ctx, userId, n) =>
    ctx.db
      .query("userOnboarding")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(n)
  ),
  direct("userPreferences", (ctx, userId, n) =>
    ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(n)
  ),
  direct("folders", (ctx, userId, n) =>
    ctx.db
      .query("folders")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(n)
  ),
  direct("reports", (ctx, userId, n) =>
    ctx.db
      .query("reports")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(n)
  ),
  direct("flashcards", (ctx, userId, n) =>
    ctx.db
      .query("flashcards")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(n)
  ),
  direct("mindmaps", (ctx, userId, n) =>
    ctx.db
      .query("mindmaps")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(n)
  ),
  direct("quizzes", (ctx, userId, n) =>
    ctx.db
      .query("quizzes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(n)
  ),
  direct("infographics", (ctx, userId, n) =>
    ctx.db
      .query("infographics")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(n)
  ),
  direct("spreadsheets", (ctx, userId, n) =>
    ctx.db
      .query("spreadsheets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(n)
  ),
  direct("writtenQuestions", (ctx, userId, n) =>
    ctx.db
      .query("writtenQuestions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(n)
  ),
  direct("notes", (ctx, userId, n) =>
    ctx.db
      .query("notes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(n)
  ),
  direct("stripeSubscriptions", (ctx, userId, n) =>
    ctx.db
      .query("stripeSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(n)
  ),
  direct("rateLimits", (ctx, userId, n) =>
    ctx.db
      .query("rateLimits")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(n)
  ),
  direct("mobilePushTokens", (ctx, userId, n) =>
    ctx.db
      .query("mobilePushTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(n)
  ),
  direct("searchAnalytics", (ctx, userId, n) =>
    ctx.db
      .query("searchAnalytics")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(n)
  ),
  direct("researchPlans", (ctx, userId, n) =>
    ctx.db
      .query("researchPlans")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(n)
  ),
  direct("literatureTables", (ctx, userId, n) =>
    ctx.db
      .query("literatureTables")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(n)
  ),
  direct("literatureReports", (ctx, userId, n) =>
    ctx.db
      .query("literatureReports")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(n)
  ),
  direct("feedback", (ctx, userId, n) =>
    ctx.db
      .query("feedback")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(n)
  ),
];

export const PURGED_TABLES: ReadonlySet<TableNames> = new Set(
  PURGE_STEPS.flatMap((step) => step.tables)
);
