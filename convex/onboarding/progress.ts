import { v } from "convex/values";
import { query } from "../_generated/server";
import { getAuthUserId } from "../auth";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

const checklistShape = {
  createNotebook: v.boolean(),
  addSource: v.boolean(),
  askQuestion: v.boolean(),
  openStudio: v.boolean(),
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
  "slides",
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
  userId: Id<"users">,
): Promise<boolean> {
  // Dynamic table name forces us through `any`; the `by_user` index exists on
  // every table listed in this function's signature.
  const q = ctx.db.query(table as never) as unknown as {
    withIndex: (
      name: string,
      cb: (b: { eq: (field: string, value: unknown) => unknown }) => unknown,
    ) => { first: () => Promise<unknown> };
  };
  const first = await q
    .withIndex("by_user", (b) => b.eq("userId", userId))
    .first();
  return first !== null;
}

/**
 * `conversations` only has `by_user_notebook` (compound) and `by_notebook`.
 * Prefix-match on `userId` over the compound index for user-scope lookups.
 */
async function userHasAnyConversation(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<boolean> {
  const first = await ctx.db
    .query("conversations")
    .withIndex("by_user_notebook", (q) => q.eq("userId", userId))
    .first();
  return first !== null;
}

async function notebookHasAny(
  ctx: QueryCtx,
  table:
    | (typeof ARTIFACT_TABLES)[number]
    | "documents"
    | "conversations",
  notebookId: Id<"notebooks">,
): Promise<boolean> {
  // Dynamic table name forces us through `any`; the `by_notebook` index exists
  // on every table listed in this function's signature.
  const q = ctx.db.query(table as never) as unknown as {
    withIndex: (
      name: string,
      cb: (b: { eq: (field: string, value: unknown) => unknown }) => unknown,
    ) => { first: () => Promise<unknown> };
  };
  const first = await q
    .withIndex("by_notebook", (b) => b.eq("notebookId", notebookId))
    .first();
  return first !== null;
}

export const getChecklistProgress = query({
  args: {},
  returns: v.object(checklistShape),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const empty = {
      createNotebook: false,
      addSource: false,
      askQuestion: false,
      openStudio: false,
      generateArtifact: false,
    };
    if (!userId) return empty;

    const [hasNotebook, hasDocument, hasConversation, ...artifactFlags] =
      await Promise.all([
        userHasAny(ctx, "notebooks", userId),
        userHasAny(ctx, "documents", userId),
        userHasAnyConversation(ctx, userId),
        ...ARTIFACT_TABLES.map((tbl) => userHasAny(ctx, tbl, userId)),
      ]);

    return {
      createNotebook: hasNotebook,
      addSource: hasDocument,
      askQuestion: hasConversation,
      openStudio: false,
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
      createNotebook: false,
      addSource: false,
      askQuestion: false,
      openStudio: false,
      generateArtifact: false,
      tourNotebookId: undefined,
    };
    if (!userId) return empty;

    const row = await ctx.db
      .query("userOnboarding")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    const createNotebook = await userHasAny(ctx, "notebooks", userId);
    const tourNotebookId = row?.tourNotebookId;

    if (!tourNotebookId) {
      return { ...empty, createNotebook };
    }

    const [addSource, askQuestion, ...artifactFlags] = await Promise.all([
      notebookHasAny(ctx, "documents", tourNotebookId),
      notebookHasAny(ctx, "conversations", tourNotebookId),
      ...ARTIFACT_TABLES.map((tbl) =>
        notebookHasAny(ctx, tbl, tourNotebookId),
      ),
    ]);

    return {
      createNotebook,
      addSource,
      askQuestion,
      openStudio: false,
      generateArtifact: artifactFlags.some(Boolean),
      tourNotebookId,
    };
  },
});
