import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { query } from "../_generated/server";
import { getAuthUserId } from "../auth";

const checklistShape = {
  createNotebook: v.boolean(),
  addSource: v.boolean(),
  askQuestion: v.boolean(),
  generateArtifact: v.boolean(),
};

const tourShape = {
  ...checklistShape,
  tourNotebookId: v.optional(v.id("notebooks")),
};

/**
 * Studio artifact tables. Each has both `by_user` and `by_notebook` indexes.
 */
const ARTIFACT_TABLES = [
  "reports",
  "flashcards",
  "quizzes",
  "mindmaps",
  "audioOverviews",
  "infographics",
  "spreadsheets",
  "writtenQuestions",
] as const;

/**
 * Tables with a plain `by_user` index keyed on `userId`.
 * (`conversations` is special-cased because it only has the compound
 * `by_user_notebook` index — see `userHasAnyConversation`.)
 */
async function userHasAny(
  ctx: QueryCtx,
  table: (typeof ARTIFACT_TABLES)[number] | "notebooks" | "documents",
  userId: Id<"users">
): Promise<boolean> {
  // Dynamic table name forces us through `any`; the `by_user` index exists on
  // every table listed in this function's signature.
  const q = ctx.db.query(table as never) as unknown as {
    withIndex: (
      name: string,
      cb: (b: { eq: (field: string, value: unknown) => unknown }) => unknown
    ) => { first: () => Promise<unknown> };
  };
  const first = await q.withIndex("by_user", (b) => b.eq("userId", userId)).first();
  return first !== null;
}

/**
 * `conversations` only has `by_user_notebook` (compound) and `by_notebook`.
 * Prefix-match on `userId` over the compound index for user-scope lookups.
 */
async function userHasAnyConversation(ctx: QueryCtx, userId: Id<"users">): Promise<boolean> {
  const first = await ctx.db
    .query("conversations")
    .withIndex("by_user_notebook", (q) => q.eq("userId", userId))
    .first();
  return first !== null;
}

const EMPTY_CHECKLIST_PROGRESS = {
  createNotebook: false,
  addSource: false,
  askQuestion: false,
  generateArtifact: false,
};

/** Resolve the notebook used for an in-progress tour (stored id or first notebook created since `startedAt`). */
async function resolveTourNotebookId(
  ctx: QueryCtx,
  userId: Id<"users">,
  row: { tourNotebookId?: Id<"notebooks">; startedAt?: number }
): Promise<Id<"notebooks"> | undefined> {
  let tourNotebookId = row.tourNotebookId;
  if (!tourNotebookId && row.startedAt !== undefined) {
    const startedAt = row.startedAt;
    const firstSinceStart = await ctx.db
      .query("notebooks")
      .withIndex("by_user_and_createdAt", (q) => q.eq("userId", userId).gte("createdAt", startedAt))
      .first();
    tourNotebookId = firstSinceStart?._id;
  }
  return tourNotebookId;
}

/** Progress flags for steps after step 1, scoped to `tourNotebookId`. Step 1 is satisfied whenever that notebook exists. */
async function checklistProgressForTourNotebook(ctx: QueryCtx, tourNotebookId: Id<"notebooks">) {
  const [addSource, askQuestion, ...artifactFlags] = await Promise.all([
    notebookHasAny(ctx, "documents", tourNotebookId),
    notebookHasAny(ctx, "conversations", tourNotebookId),
    ...ARTIFACT_TABLES.map((tbl) => notebookHasAny(ctx, tbl, tourNotebookId)),
  ]);

  return {
    createNotebook: true,
    addSource,
    askQuestion,
    generateArtifact: artifactFlags.some(Boolean),
  };
}

async function notebookHasAny(
  ctx: QueryCtx,
  table: (typeof ARTIFACT_TABLES)[number] | "documents" | "conversations",
  notebookId: Id<"notebooks">
): Promise<boolean> {
  // Dynamic table name forces us through `any`; the `by_notebook` index exists
  // on every table listed in this function's signature.
  const q = ctx.db.query(table as never) as unknown as {
    withIndex: (
      name: string,
      cb: (b: { eq: (field: string, value: unknown) => unknown }) => unknown
    ) => { first: () => Promise<unknown> };
  };
  const first = await q.withIndex("by_notebook", (b) => b.eq("notebookId", notebookId)).first();
  return first !== null;
}

export const getChecklistProgress = query({
  args: {},
  returns: v.object(checklistShape),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return EMPTY_CHECKLIST_PROGRESS;

    const row = await ctx.db
      .query("userOnboarding")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    // While the guided tour is active, mirror tour-scoped progress so restartTour
    // (new startedAt, cleared tourNotebookId) resets the checklist with the tour.
    if (row?.tourStatus === "active") {
      const tourNotebookId = await resolveTourNotebookId(ctx, userId, row);
      if (!tourNotebookId) {
        return EMPTY_CHECKLIST_PROGRESS;
      }
      return await checklistProgressForTourNotebook(ctx, tourNotebookId);
    }

    const [hasNotebook, hasDocument, hasConversation, ...artifactFlags] = await Promise.all([
      userHasAny(ctx, "notebooks", userId),
      userHasAny(ctx, "documents", userId),
      userHasAnyConversation(ctx, userId),
      ...ARTIFACT_TABLES.map((tbl) => userHasAny(ctx, tbl, userId)),
    ]);

    return {
      createNotebook: hasNotebook,
      addSource: hasDocument,
      askQuestion: hasConversation,
      generateArtifact: artifactFlags.some(Boolean),
    };
  },
});

export const getTourProgress = query({
  args: {},
  returns: v.object(tourShape),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const empty = {
      ...EMPTY_CHECKLIST_PROGRESS,
      tourNotebookId: undefined,
    };
    if (!userId) return empty;

    const row = await ctx.db
      .query("userOnboarding")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    // tourNotebookId comes from the row once step 1 has been advanced. Before
    // that (fresh tour or after restart), find the first notebook the user
    // created since startedAt so advanceTourStep can bind it on the next call.
    const tourNotebookId = row ? await resolveTourNotebookId(ctx, userId, row) : undefined;

    if (!tourNotebookId) {
      return empty;
    }

    const progress = await checklistProgressForTourNotebook(ctx, tourNotebookId);
    return { ...progress, tourNotebookId };
  },
});
