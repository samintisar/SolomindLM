import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";

/**
 * Database operations for written questions.
 * No query/mutation/action exports — used by convex/writtenQuestions.ts and jobs.
 */

export async function getWrittenQuestion(
  ctx: QueryCtx,
  writtenQuestionId: Id<"writtenQuestions">
): Promise<Doc<"writtenQuestions"> | null> {
  return await ctx.db.get("writtenQuestions", writtenQuestionId);
}

export async function listByNotebook(
  ctx: QueryCtx,
  notebookId: Id<"notebooks">,
  userId?: Id<"users">
): Promise<Doc<"writtenQuestions">[]> {
  const query = ctx.db
    .query("writtenQuestions")
    .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId));

  if (userId) {
    return await query
      .filter((q) => q.eq(q.field("userId"), userId))
      .order("desc")
      .collect();
  }
  return await query.order("desc").collect();
}

export type WrittenQuestionCreate = {
  userId: Id<"users">;
  notebookId: Id<"notebooks">;
  title: string;
  questionType: string;
  questionsData?: unknown[];
  metadata?: unknown;
  status?: string;
};

export async function createWrittenQuestion(
  ctx: MutationCtx,
  data: WrittenQuestionCreate
): Promise<Id<"writtenQuestions">> {
  const now = Date.now();
  return await ctx.db.insert("writtenQuestions", {
    userId: data.userId,
    notebookId: data.notebookId,
    title: data.title,
    status: data.status ?? "draft",
    questionsData: data.questionsData ?? [],
    questionType: data.questionType,
    metadata: data.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Create a written question set and return the created document.
 */
export async function createWrittenQuestionAndFetch(
  ctx: MutationCtx,
  data: WrittenQuestionCreate
): Promise<Doc<"writtenQuestions">> {
  const id = await createWrittenQuestion(ctx, data);
  const writtenQuestion = await getWrittenQuestion(ctx, id);
  if (!writtenQuestion) throw new Error("Failed to create written question set");
  return writtenQuestion;
}

export type WrittenQuestionUpdate = {
  title?: string;
  status?: string;
  questionsData?: unknown[];
  metadata?: unknown;
};

export async function updateWrittenQuestion(
  ctx: MutationCtx,
  writtenQuestionId: Id<"writtenQuestions">,
  updates: WrittenQuestionUpdate,
  mergeMetadata = false
): Promise<void> {
  const updateData: Record<string, unknown> = {
    ...updates,
    updatedAt: Date.now(),
  };

  if (mergeMetadata && updates.metadata) {
    const existing = await getWrittenQuestion(ctx, writtenQuestionId);
    if (existing) {
      updateData.metadata = {
        ...(existing.metadata ?? {}),
        ...(updates.metadata as Record<string, unknown>),
      };
    }
  }

  await ctx.db.patch("writtenQuestions", writtenQuestionId, updateData);
}

export async function updateWrittenQuestionStatus(
  ctx: MutationCtx,
  writtenQuestionId: Id<"writtenQuestions">,
  status: string
): Promise<void> {
  await ctx.db.patch("writtenQuestions", writtenQuestionId, {
    status,
    updatedAt: Date.now(),
  });
}

export async function updateWrittenQuestionData(
  ctx: MutationCtx,
  writtenQuestionId: Id<"writtenQuestions">,
  questionsData: unknown[]
): Promise<void> {
  await ctx.db.patch("writtenQuestions", writtenQuestionId, {
    questionsData,
    status: "completed",
    updatedAt: Date.now(),
  });
}

export async function patchWrittenQuestion(
  ctx: MutationCtx,
  writtenQuestionId: Id<"writtenQuestions">,
  patch: Record<string, unknown>
): Promise<void> {
  // If updating metadata, merge with existing metadata instead of replacing
  if (patch.metadata) {
    const existing = await getWrittenQuestion(ctx, writtenQuestionId);
    if (existing) {
      patch = {
        ...patch,
        metadata: {
          ...((existing.metadata as Record<string, unknown>) ?? {}),
          ...(patch.metadata as Record<string, unknown>),
        },
      };
    }
  }

  await ctx.db.patch("writtenQuestions", writtenQuestionId, {
    ...patch,
    updatedAt: Date.now(),
  });
}

export async function patchWrittenQuestionUserAnswer(
  ctx: MutationCtx,
  writtenQuestionId: Id<"writtenQuestions">,
  questionId: string,
  answerData: unknown
): Promise<void> {
  const writtenQuestion = await getWrittenQuestion(ctx, writtenQuestionId);
  if (!writtenQuestion) throw new Error("Written question set not found");

  const existingUserAnswers =
    (writtenQuestion.metadata as { userAnswers?: Record<string, unknown> })?.userAnswers || {};

  await ctx.db.patch("writtenQuestions", writtenQuestionId, {
    metadata: {
      ...writtenQuestion.metadata,
      userAnswers: {
        ...existingUserAnswers,
        [questionId]: answerData,
      },
    },
    updatedAt: Date.now(),
  });
}

export async function deleteWrittenQuestion(
  ctx: MutationCtx,
  writtenQuestionId: Id<"writtenQuestions">
): Promise<void> {
  await ctx.db.delete("writtenQuestions", writtenQuestionId);
}
